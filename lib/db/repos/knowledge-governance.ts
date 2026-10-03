import "server-only";
import {randomUUID} from "node:crypto";
import {sql,type SQL} from "drizzle-orm";
import {z} from "zod";
import {canonicalHttpsUrl} from "@/lib/security/https-url";
import {requireAdmin} from "@/lib/auth/authorize";
import {chunkKnowledge,sourceContentHash,factsHash,structuredKnowledgeFactsSchema,knowledgeRefSchema,canReadKnowledge,type KnowledgeRef} from "@/lib/ai/knowledge/policy";
import {createOpenAIEmbeddingAdapter,type EmbeddingAdapter} from "@/lib/ai/embeddings";
import {getDb} from "@/lib/db/repos/common";
import {configuredAiBudgetLimits} from "@/lib/db/repos/ai-budget";
import type {KbDatabaseLoader} from "@/lib/db/repos/kb-documents";
import type {Actor,AdminActor} from "@/lib/membership/lifecycle";
const scope=z.object({sourceId:z.string().uuid(),locale:z.enum(["en","zh-HK"]),version:z.number().int().positive()}).strict();
export const knowledgeVersionSchema=scope.omit({version:true}).extend({expectedVersion:z.number().int().nonnegative(),namespace:z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/),title:z.string().trim().min(1).max(300),url:z.string().max(2048).url().refine(value=>{try{return canonicalHttpsUrl(value,{allowQuery:true})===value&&!new URL(value).hash;}catch{return false;}}),content:z.string().min(1).max(100_000),audience:z.enum(["public","staff"]),effectiveFrom:z.string().datetime({offset:true}),effectiveTo:z.string().datetime({offset:true}).nullable(),reviewDue:z.string().datetime({offset:true}),structuredFacts:structuredKnowledgeFactsSchema}).strict().refine(value=>Date.parse(value.reviewDue)>Date.parse(value.effectiveFrom)&&(!value.effectiveTo||Date.parse(value.effectiveTo)>Date.parse(value.effectiveFrom)),"KNOWLEDGE_DATE_INVALID");
export const knowledgeReviewSchema=scope.extend({decision:z.enum(["approve","withdraw"])}).strict();
export const knowledgeIndexSchema=scope;
export type KnowledgeVersionInput=z.infer<typeof knowledgeVersionSchema>;
export type KnowledgeVersionSummary=Readonly<{sourceId:string;version:number;locale:"en"|"zh-HK";title:string;url:string;audience:"public"|"staff";approvalState:string;indexState:string;ownerId:string|null;approverId:string|null;effectiveFrom:string|null;effectiveTo:string|null;reviewDue:string|null;supersedesVersion:number|null;contentHash:string|null;originalContent:string|null;structuredFacts:Record<string,string|number|boolean|null>}>;
function rows(result:unknown):Record<string,unknown>[] {if(Array.isArray(result))return result;if(result&&typeof result==="object"&&"rows" in result&&Array.isArray(result.rows))return result.rows as Record<string,unknown>[];throw Error("KNOWLEDGE_SQL_RESULT_INVALID");}
function date(value:unknown):Date {return value instanceof Date?value:new Date(String(value));}
function iso(value:unknown):string|null {return value===null||value===undefined?null:date(value).toISOString();}
function summary(row:Record<string,unknown>):KnowledgeVersionSummary {return {sourceId:String(row.source_id),version:Number(row.version),locale:z.enum(["en","zh-HK"]).parse(row.locale),title:String(row.title),url:String(row.url),audience:z.enum(["public","staff"]).parse(row.audience),approvalState:String(row.approval_state),indexState:String(row.index_state),ownerId:row.owner_profile_id===null?null:String(row.owner_profile_id),approverId:row.approved_by===null?null:String(row.approved_by),effectiveFrom:iso(row.effective_from),effectiveTo:iso(row.effective_to),reviewDue:iso(row.review_due),supersedesVersion:row.supersedes_version===null?null:Number(row.supersedes_version),contentHash:row.content_hash===null?null:String(row.content_hash),originalContent:row.original_content===null?String(row.content):String(row.original_content),structuredFacts:structuredKnowledgeFactsSchema.parse(row.structured_facts)};}
export function configuredKnowledgeApprovers(env:Readonly<Partial<NodeJS.ProcessEnv>>=process.env):readonly string[] {const values=(env.AI_KNOWLEDGE_APPROVAL_PROFILE_IDS??"").split(",").map(v=>v.trim()).filter(Boolean);return values.length<=50&&values.every(v=>/^[a-zA-Z0-9_-]{1,255}$/.test(v))?values:[];}
export function knowledgeManagementEnabled():boolean {return process.env.AI_KNOWLEDGE_MANAGEMENT_ENABLED==="true";}
export function createKnowledgeGovernanceRepository(load:KbDatabaseLoader=async()=>await getDb() as never,embedding:()=>EmbeddingAdapter=()=>{if(!configuredAiBudgetLimits())throw Error("KNOWLEDGE_PROVIDER_CONFIG_REQUIRED");return createOpenAIEmbeddingAdapter(process.env.OPENAI_API_KEY??"");},approvers:()=>readonly string[]=configuredKnowledgeApprovers){
 type Executor=Readonly<{execute:(query:SQL)=>Promise<unknown>}>;
 async function locked<T>(work:(tx:Executor)=>Promise<T>):Promise<T> {const db=await load();return db.transaction(async tx=>{await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('hkwtia-knowledge-governance-v1',0))`);return work(tx);});}
 async function selected(tx:Executor,input:z.infer<typeof scope>){const result=rows(await tx.execute(sql`SELECT * FROM kb_documents WHERE source_id=${input.sourceId} AND locale=${input.locale} AND version=${input.version} ORDER BY chunk_start,id FOR UPDATE`));if(!result.length)throw Error("KNOWLEDGE_VERSION_MISSING");return result;}
 async function audit(tx:Executor,actor:AdminActor,action:string,target:string,metadata:Readonly<Record<string,unknown>>){await tx.execute(sql`INSERT INTO audit_events(actor_user_id,actor_type,action,target_type,target_id,request_id,metadata) VALUES(${actor.profileId},${actor.kind},${action},'knowledge_version',${target},${randomUUID()},${JSON.stringify(metadata)}::jsonb)`);}
 return {
  async createVersion(actor:Actor,input:unknown):Promise<KnowledgeVersionSummary>{
   requireAdmin(actor);const parsed=knowledgeVersionSchema.parse(input);const chunks=chunkKnowledge(parsed.content),hash=sourceContentHash(parsed.content);
   return locked(async tx=>{
    const prior=rows(await tx.execute(sql`SELECT * FROM kb_documents WHERE source_id=${parsed.sourceId} AND locale=${parsed.locale} ORDER BY version DESC,chunk_start LIMIT 1 FOR UPDATE`))[0];
    if(Number(prior?.version??0)!==parsed.expectedVersion)throw Error("KNOWLEDGE_VERSION_CONFLICT");
    if(prior&&(prior.namespace!==parsed.namespace||prior.url!==parsed.url))throw Error("KNOWLEDGE_SOURCE_CONFLICT");
    if(rows(await tx.execute(sql`SELECT id FROM kb_documents WHERE namespace=${parsed.namespace} AND locale=${parsed.locale} AND url=${parsed.url} AND source_id<>${parsed.sourceId} AND approval_state<>'unverified' LIMIT 1`)).length)throw Error("KNOWLEDGE_SOURCE_CONFLICT");
    const version=parsed.expectedVersion+1;
    const values=sql.join(chunks.map(chunk=>sql`(${randomUUID()},${parsed.namespace},${parsed.locale},${parsed.title},${parsed.url},${chunk.content},'{}'::jsonb,${"["+Array(1536).fill(0).join(",")+"]"}::vector,${parsed.sourceId},${version},'draft',${parsed.audience},${actor.profileId},${new Date(parsed.effectiveFrom)},${parsed.effectiveTo?new Date(parsed.effectiveTo):null},${new Date(parsed.reviewDue)},${hash},${parsed.content},${chunk.offsetStart},${chunk.offsetEnd},${JSON.stringify(parsed.structuredFacts)}::jsonb,${version>1?version-1:null})`),sql`, `);
    const inserted=rows(await tx.execute(sql`INSERT INTO kb_documents(id,namespace,locale,title,url,content,metadata,embedding,source_id,version,approval_state,audience,owner_profile_id,effective_from,effective_to,review_due,content_hash,original_content,chunk_start,chunk_end,structured_facts,supersedes_version) VALUES ${values} RETURNING *`));
    await audit(tx,actor,"knowledge_version_created",parsed.sourceId,{locale:parsed.locale,version,contentHash:hash,chunkCount:chunks.length});return summary(inserted[0]!);
   });
  },
  async reviewVersion(actor:Actor,input:unknown):Promise<KnowledgeVersionSummary>{
   requireAdmin(actor);const parsed=knowledgeReviewSchema.parse(input);
   const allowed=approvers();if(!allowed.length)throw Error("KNOWLEDGE_APPROVER_CONFIGURATION_REQUIRED");if(!allowed.includes(actor.profileId))throw Error("KNOWLEDGE_APPROVER_NOT_ALLOWED");
   return locked(async tx=>{
    const chunks=await selected(tx,parsed),first=chunks[0]!;
    if(parsed.decision==="approve"){
     if(first.owner_profile_id===actor.profileId)throw Error("KNOWLEDGE_SELF_APPROVAL_FORBIDDEN");
     if(first.approval_state==="approved")return summary(first);
     if(first.approval_state!=="draft")throw Error("KNOWLEDGE_REVIEW_CONFLICT");
     if(rows(await tx.execute(sql`SELECT id FROM kb_documents WHERE source_id=${parsed.sourceId} AND locale=${parsed.locale} AND version>${parsed.version} LIMIT 1`)).length)throw Error("KNOWLEDGE_VERSION_CONFLICT");
     const previous=rows(await tx.execute(sql`SELECT DISTINCT effective_from FROM kb_documents WHERE source_id=${parsed.sourceId} AND locale=${parsed.locale} AND version<${parsed.version} AND approval_state='approved'`));
     if(previous.some(row=>date(row.effective_from).getTime()>=date(first.effective_from).getTime()))throw Error("KNOWLEDGE_EFFECTIVE_ORDER_INVALID");
     const translations=rows(await tx.execute(sql`SELECT DISTINCT structured_facts FROM kb_documents WHERE source_id=${parsed.sourceId} AND locale<>${parsed.locale} AND approval_state='approved' AND effective_from<${first.effective_to??first.review_due} AND (effective_to IS NULL OR effective_to>${first.effective_from})`));
     const candidate=structuredKnowledgeFactsSchema.parse(first.structured_facts);
     if(translations.some(row=>factsHash(structuredKnowledgeFactsSchema.parse(row.structured_facts))!==factsHash(candidate)))throw Error("KNOWLEDGE_LOCALE_CONFLICT");
     // Closing prior intervals preserves history and prevents fallback to old policy after a withdrawal.
     await tx.execute(sql`UPDATE kb_documents SET effective_to=LEAST(COALESCE(effective_to,'infinity'::timestamptz),${first.effective_from}),updated_at=now() WHERE source_id=${parsed.sourceId} AND locale=${parsed.locale} AND version<${parsed.version} AND approval_state='approved'`);
     await tx.execute(sql`UPDATE kb_documents SET approval_state='approved',approved_by=${actor.profileId},updated_at=now() WHERE source_id=${parsed.sourceId} AND locale=${parsed.locale} AND version=${parsed.version}`);
    }else{
     if(first.approval_state==="withdrawn")return summary(first);
     await tx.execute(sql`UPDATE kb_documents SET approval_state='withdrawn',index_state='unindexed',index_attempt_id=NULL,updated_at=now() WHERE source_id=${parsed.sourceId} AND locale=${parsed.locale} AND version=${parsed.version}`);
    }
    await audit(tx,actor,"knowledge_version_"+parsed.decision,parsed.sourceId,{locale:parsed.locale,version:parsed.version,contentHash:first.content_hash});return summary((await selected(tx,parsed))[0]!);
   });
  },
  async indexVersion(actor:Actor,input:unknown):Promise<KnowledgeVersionSummary>{
   requireAdmin(actor);const parsed=scope.parse(input),attempt=randomUUID();
   const adapter=embedding(); // Missing provider config fails before a durable claim or any request.
   const chunks=await locked(async tx=>{const selectedChunks=await selected(tx,parsed);if(selectedChunks.some(row=>row.approval_state!=="approved"||row.index_state!=="unindexed"))throw Error("KNOWLEDGE_INDEX_RECONCILIATION_REQUIRED");await tx.execute(sql`UPDATE kb_documents SET index_state='indexing',index_attempt_id=${attempt},updated_at=now() WHERE source_id=${parsed.sourceId} AND locale=${parsed.locale} AND version=${parsed.version}`);await audit(tx,actor,"knowledge_index_claimed",parsed.sourceId,{locale:parsed.locale,version:parsed.version,attempt});return selectedChunks;});
   try{
    const indexed:number[][]=[];
    for(const chunk of chunks){const values=await adapter.embed(String(chunk.content));if(values.length!==1536||values.some(v=>!Number.isFinite(v))||values.every(v=>v===0))throw Error("KB_EMBEDDING_INVALID");indexed.push([...values]);}
    return await locked(async tx=>{const latest=await selected(tx,parsed);if(latest.some(row=>row.approval_state!=="approved"||row.index_state!=="indexing"||row.index_attempt_id!==attempt))throw Error("KNOWLEDGE_INDEX_STALE");for(let i=0;i<chunks.length;i++)await tx.execute(sql`UPDATE kb_documents SET embedding=${"["+indexed[i]!.join(",")+"]"}::vector,index_state='ready',updated_at=now() WHERE id=${String(chunks[i]!.id)} AND index_attempt_id=${attempt}`);await audit(tx,actor,"knowledge_index_ready",parsed.sourceId,{locale:parsed.locale,version:parsed.version,attempt});return summary((await selected(tx,parsed))[0]!);});
   }catch{
    await locked(async tx=>{await tx.execute(sql`UPDATE kb_documents SET index_state='failed',updated_at=now() WHERE source_id=${parsed.sourceId} AND locale=${parsed.locale} AND version=${parsed.version} AND index_attempt_id=${attempt} AND index_state='indexing'`);await audit(tx,actor,"knowledge_index_failed_reconcile",parsed.sourceId,{locale:parsed.locale,version:parsed.version,attempt});});throw Error("KNOWLEDGE_INDEX_RECONCILIATION_REQUIRED");
   }
  },
  async listVersions(actor:Actor,offset=0):Promise<{versions:readonly KnowledgeVersionSummary[];hasMore:boolean}>{requireAdmin(actor);z.number().int().nonnegative().max(10000).parse(offset);const db=await load();const result=rows(await db.execute(sql`SELECT * FROM (SELECT DISTINCT ON(source_id,locale,version) * FROM kb_documents ORDER BY source_id,locale,version DESC,chunk_start) versions ORDER BY updated_at DESC,source_id,locale,version DESC OFFSET ${offset} LIMIT 51`));return {versions:result.slice(0,50).map(summary),hasMore:result.length>50};},
  async referencesCurrent(actor:Actor,refs:readonly KnowledgeRef[],asOf:Date):Promise<boolean>{
   if(!Number.isFinite(asOf.getTime())||refs.length>50)throw Error("KNOWLEDGE_SCOPE_INVALID");const parsed=refs.map(ref=>knowledgeRefSchema.parse(ref));if(!parsed.length)return false;
   const db=await load();for(const ref of parsed){if(!canReadKnowledge(actor,ref.audience))return false;const current=rows(await db.execute(sql`SELECT id FROM kb_documents WHERE source_id=${ref.sourceId} AND locale=${ref.locale} AND version=${Number(ref.version)} AND audience=${ref.audience} AND approval_state='approved' AND index_state='ready' AND content_hash=${ref.contentHash} AND effective_from=${new Date(ref.effectiveFrom)} AND effective_to IS NOT DISTINCT FROM ${ref.effectiveTo?new Date(ref.effectiveTo):null}::timestamptz AND effective_from<=${asOf} AND (effective_to IS NULL OR effective_to>${asOf}) AND review_due>${asOf} LIMIT 1`));if(!current.length)return false;}return true;
  },
 };
}
export const knowledgeGovernanceRepository=createKnowledgeGovernanceRepository();

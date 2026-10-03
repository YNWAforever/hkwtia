import "server-only";
import {createHash} from "node:crypto";
import {z} from "zod";
import {isAdminActor} from "@/lib/auth/authorize";
import type {Actor} from "@/lib/membership/lifecycle";
export const knowledgeRefSchema=z.object({sourceId:z.string().uuid(),version:z.string().regex(/^[1-9]\d*$/),locale:z.enum(["en","zh-HK"]),audience:z.enum(["public","staff"]),effectiveFrom:z.string().datetime({offset:true}),effectiveTo:z.string().datetime({offset:true}).nullable(),contentHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type KnowledgeRef=z.infer<typeof knowledgeRefSchema>;
export type KnowledgeChunk=Readonly<{content:string;offsetStart:number;offsetEnd:number}>;
export const structuredKnowledgeFactsSchema=z.record(z.string().regex(/^[a-z][a-zA-Z0-9_.-]{0,63}$/),z.union([z.string().max(500),z.number().finite(),z.boolean(),z.null()])).refine(value=>Object.keys(value).length<=64,"KNOWLEDGE_FACTS_TOO_MANY");
export function sourceContentHash(content:string):string {return createHash("sha256").update(content,"utf8").digest("hex");}
export function factsHash(facts:Readonly<Record<string,string|number|boolean|null>>):string {return sourceContentHash(JSON.stringify(Object.fromEntries(Object.entries(facts).sort(([a],[b])=>a.localeCompare(b)))));}
/** A policy date means midnight in Hong Kong, never the server's local timezone. */
export function hongKongEffectiveDate(date:string):string {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error("KNOWLEDGE_DATE_INVALID");
 const at=new Date(date+"T00:00:00+08:00");
 if(!Number.isFinite(at.getTime())||new Date(at.getTime()+8*3600_000).toISOString().slice(0,10)!==date)throw Error("KNOWLEDGE_DATE_INVALID");
 return at.toISOString();
}
export function canReadKnowledge(actor:Actor,audience:"public"|"staff"):boolean {return audience==="public"||isAdminActor(actor);}
/** Unicode code-point offsets address the exact stored original (PostgreSQL substring). Paragraph/sentence boundaries are preferred; oversized sentences split on code points. */
export function chunkKnowledge(content:string):readonly KnowledgeChunk[] {
 if(!content.trim()||content.length>100_000)throw Error("KB_CONTENT_INVALID");
 const chunks:KnowledgeChunk[]=[];
 for(const paragraph of content.matchAll(/[^\r\n]+(?:\r?\n(?!\r?\n)[^\r\n]+)*/g)){
  const start=paragraph.index!,text=paragraph[0];let cursor=0;
  while(cursor<text.length){let end=cursor,boundary=cursor,bytes=0;
   for(const character of text.slice(cursor)){const next=Buffer.byteLength(character,"utf8");if(bytes+next>4000)break;bytes+=next;end+=character.length;if(/[。！？.!?\n]/.test(character))boundary=end;}
   const chosen=end===text.length?end:boundary>cursor?boundary:end;
   if(chosen<=cursor)throw Error("KB_CONTENT_INVALID");
   const chunk=text.slice(cursor,chosen);if(chunk.trim())chunks.push({content:chunk,offsetStart:start+cursor,offsetEnd:start+chosen});cursor=chosen;
   if(chunks.length>256)throw Error("KB_CONTENT_TOO_FRAGMENTED");
  }
 }
 if(!chunks.length)throw Error("KB_CONTENT_INVALID");
 const offsets=new Map<number,number>();let utf16=0,codePoints=0;offsets.set(0,0);for(const character of content){utf16+=character.length;offsets.set(utf16,++codePoints);}
 return Object.freeze(chunks.map(chunk=>Object.freeze({...chunk,offsetStart:offsets.get(chunk.offsetStart)!,offsetEnd:offsets.get(chunk.offsetEnd)!})));
}

/** Trusted server interface; role derives scope before SQL vector ordering. No retrieval cache outlives a source change. */
export async function selectApprovedKnowledge({actor,locale,asOf,query}:Readonly<{actor:Actor;locale:"en"|"zh-HK";asOf:Date;query:string}>):Promise<readonly {excerpt:string;retrievalScore:number;ref:KnowledgeRef}[]> {
 const parsed=z.object({locale:z.enum(["en","zh-HK"]),asOf:z.date().refine(date=>Number.isFinite(date.getTime())),query:z.string().trim().min(1).max(500)}).parse({locale,asOf,query});
 const [{kbDocumentsRepository},{createOpenAIEmbeddingAdapter}]=await Promise.all([import("@/lib/db/repos/kb-documents"),import("@/lib/ai/embeddings")]);
 const queryEmbedding=await createOpenAIEmbeddingAdapter(process.env.OPENAI_API_KEY??"").embed(parsed.query);
 const rows=await kbDocumentsRepository.search({namespace:"m4a-core-v1",locale:parsed.locale,asOf:parsed.asOf,queryEmbedding,k:5,audience:isAdminActor(actor)?"staff":"public"});
 return rows.map(row=>({excerpt:row.excerpt,retrievalScore:row.score,ref:row.ref}));
}

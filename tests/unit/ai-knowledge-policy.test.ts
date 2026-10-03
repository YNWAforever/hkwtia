// @vitest-environment node
import {describe,expect,it,vi} from "vitest";
import {createKbSearchTool} from "@/lib/ai/tools/kb-search";
import type {ConciergeToolContext} from "@/lib/ai/tools/shared";
const ref={sourceId:"11111111-1111-4111-8111-111111111111",version:"1",locale:"en",audience:"public",effectiveFrom:"2040-01-01T00:00:00Z",effectiveTo:null,contentHash:"a".repeat(64)};
function tool(version="1"){
 return createKbSearchTool({actor:{kind:"agent",agent:"concierge",profileId:null,runId:"synthetic-run",conversationId:"synthetic-conversation",trigger:"web"},locale:"en",appOrigin:"https://example.test",audit:vi.fn(async()=>{}),embedding:{dimensions:1536,embed:vi.fn(async()=>[1,...Array(1535).fill(0)])},repositories:{searchKnowledge:vi.fn(async()=>[{title:"Approved guide",url:"https://example.test/policy",excerpt:"A complete approved paragraph.",score:0.9,ref:{...ref,version},offsetStart:0,offsetEnd:30}])} as unknown as ConciergeToolContext["repositories"]});
}
describe("knowledge citation contract",()=>{
 it("includes approved version and content hash while relevance is not confidence",async()=>{
  const output=await tool().execute({query:"membership",k:1},{});
  expect(output.value).toEqual([expect.objectContaining({knowledgeRef:ref,retrievalScore:0.9})]);
  expect(JSON.stringify(output)).not.toContain('"confidence"');
 });
 it("same URL version replacement changes citation identity",async()=>{
  const old=await tool("1").execute({query:"membership",k:1},{});
  const current=await tool("2").execute({query:"membership",k:1},{});
  expect(current.citations?.[0]?.sourceId).not.toEqual(old.citations?.[0]?.sourceId);
 });
});

import {chunkKnowledge,hongKongEffectiveDate,sourceContentHash,canReadKnowledge} from "@/lib/ai/knowledge/policy";
import {ANONYMOUS_ACTOR} from "@/lib/membership/lifecycle";
describe("knowledge scope and original offsets",()=>{
 it("uses Hong Kong midnight and rejects rollover dates",()=>{expect(hongKongEffectiveDate("2040-01-01")).toBe("2039-12-31T16:00:00.000Z");expect(()=>hongKongEffectiveDate("2040-02-30")).toThrow("KNOWLEDGE_DATE_INVALID");});
 it("preserves complete bounded paragraphs/sentences, emoji and exact original offsets",()=>{const original="第一段😀。\n\n"+"續會政策💡".repeat(1000)+"。\n\nRefunds require human review.";const chunks=chunkKnowledge(original);expect(chunks.length).toBeGreaterThan(2);for(const chunk of chunks){expect([...original].slice(chunk.offsetStart,chunk.offsetEnd).join("")).toBe(chunk.content);expect(Buffer.byteLength(chunk.content,"utf8")).toBeLessThanOrEqual(4000);expect(chunk.content).not.toContain("�");}expect(chunks.at(-1)!.content).toBe("Refunds require human review.");expect(sourceContentHash(original)).toHaveLength(64);});
 it("public and member scopes cannot read staff policy",()=>{expect(canReadKnowledge(ANONYMOUS_ACTOR,"staff")).toBe(false);expect(canReadKnowledge({kind:"member",userId:"synthetic",profileId:"synthetic"},"staff")).toBe(false);expect(canReadKnowledge({kind:"staff",userId:"synthetic",profileId:"synthetic"},"staff")).toBe(true);});
});

import {normalizeAgentCitations} from "@/lib/ai/provider";
describe("relevance through runtime citation boundary",()=>{
 it("retains known retrieval relevance without converting it to confidence",()=>{expect(normalizeAgentCitations([{sourceId:"kb:verified",title:"Source",retrievalScore:0.9}])).toEqual([{sourceId:"kb:verified",title:"Source",retrievalScore:0.9}]);});
 it("rejects invalid retrieval relevance",()=>{expect(normalizeAgentCitations([{sourceId:"kb:verified",title:"Source",retrievalScore:2}])).toEqual([]);});
});

import {knowledgeVersionSchema} from "@/lib/db/repos/knowledge-governance";
const sourceInput={sourceId:ref.sourceId,expectedVersion:0,namespace:"t07-url-contract",locale:"en",title:"Synthetic policy",content:"Manual review policy.",audience:"public",effectiveFrom:"2039-01-01T00:00:00Z",effectiveTo:null,reviewDue:"2041-01-01T00:00:00Z",structuredFacts:{}};
describe("knowledge source uses the shared public HTTPS policy",()=>{
 it.each(["https://localhost/policy","https://source.localhost/policy","https://127.0.0.1/policy","https://[::1]/policy","https://example.test./policy"])("rejects forbidden source %s",url=>{expect(knowledgeVersionSchema.safeParse({...sourceInput,url}).success).toBe(false);});
 it("preserves a canonical public source query without allowing a fragment",()=>{expect(knowledgeVersionSchema.safeParse({...sourceInput,url:"https://example.test/policy?version=1"}).success).toBe(true);expect(knowledgeVersionSchema.safeParse({...sourceInput,url:"https://example.test/policy#draft"}).success).toBe(false);});
});

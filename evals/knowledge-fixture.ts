/** Explicitly synthetic approved knowledge for offline harnesses; never a production approval mechanism. */
import {createHash} from "node:crypto";
import type {KnowledgeRef} from "@/lib/ai/knowledge/policy";
export function offlineKnowledgeRef(locale:"en"|"zh-HK",url:string,content:string):KnowledgeRef {
 const hex=createHash("sha256").update(url).digest("hex");
 return {sourceId:`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`,version:"1",locale,audience:"public",effectiveFrom:"2020-01-01T00:00:00.000Z",effectiveTo:null,contentHash:createHash("sha256").update(content).digest("hex")};
}

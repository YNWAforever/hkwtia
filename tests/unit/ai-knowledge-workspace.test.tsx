import {render,screen} from "@testing-library/react";
import {describe,expect,it,vi} from "vitest";
import en from "@/messages/en.json";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/lib/admin/knowledge-actions",()=>({createKnowledgeVersionAction:vi.fn(),reviewKnowledgeVersionAction:vi.fn(),indexKnowledgeVersionAction:vi.fn()}));
vi.mock("@/components/admin/unsaved-changes-guard",()=>({useAdminUnsavedChanges:()=>({setDirty:vi.fn(),confirmLeave:()=>true})}));
import {KnowledgeWorkspace} from "@/components/admin/knowledge-workspace";
import type {KnowledgeVersionSummary} from "@/lib/db/repos/knowledge-governance";
const version:KnowledgeVersionSummary={sourceId:"00000000-0000-4000-8000-000000000007",version:1,locale:"en",title:"Synthetic source",url:"https://example.test/source",audience:"staff",ownerId:"synthetic-owner",approverId:"synthetic-reviewer",effectiveFrom:"2026-09-30T16:00:00.000Z",effectiveTo:"2026-10-31T16:00:00.000Z",reviewDue:"2026-10-30T16:00:00.000Z",approvalState:"approved",indexState:"unindexed",contentHash:"a".repeat(64),supersedesVersion:null,originalContent:"Synthetic source",structuredFacts:{}};
describe("knowledge workspace Hong Kong date labels",()=>{
 it("displays Hong Kong calendar dates rather than the prior UTC date under Hong Kong labels",()=>{
  render(<KnowledgeWorkspace labels={en.Knowledge} versions={[version]} sourceId={version.sourceId} enabled locale="en"/>);
  for(const [label,value] of [[en.Knowledge.effectiveFrom,"2026-10-01"],[en.Knowledge.effectiveTo,"2026-11-01"],[en.Knowledge.reviewDue,"2026-10-31"]]){
   expect(screen.getByText(label,{selector:"dt"}).nextElementSibling).toHaveTextContent(value!);
  }
  expect(screen.queryByText(version.effectiveFrom!)).not.toBeInTheDocument();
 });
});

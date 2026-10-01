import {fireEvent,render,screen} from "@testing-library/react";
import {describe,expect,it} from "vitest";
import {ApplicationCaseForm} from "@/components/admin/application-case-form";
import type {ApplicationCase} from "@/lib/admin/application-case-types";
const labels={title:"Synthetic follow-up",description:"Synthetic description",owner:"Owner",unassigned:"Unassigned",due:"Due",missing:"Missing",nextAction:"Next action",note:"Note",save:"Save",saving:"Saving",saved:"Saved",conflict:"Conflict",error:"Error",refresh:"Reload",missingFields:{companyWebsite:"Website"},nextActions:{none:"None",await_documents:"Await documents"}};
const original:ApplicationCase={application:{id:"10000000-0000-4000-8000-000000000001",profileId:"profile",name:"Synthetic applicant",companyId:null,companyName:null,planCode:"startup",status:"draft",step:"profile"},membership:null,payment:null,version:"10000000-0000-4000-8000-000000000002",ownerProfileId:null,dueAt:null,missingFields:[],nextActionCode:"none",timeline:[]};
const action=async()=>({status:"saved" as const,version:"10000000-0000-4000-8000-000000000003"});
describe("application case editor snapshot",()=>{
 it("an external refresh cannot upgrade the CAS version attached to unsaved fields",()=>{
  const {container,rerender}=render(<ApplicationCaseForm record={original} owners={[]} labels={labels} action={action} refreshHref="/admin/members/queue/example"/>);fireEvent.change(screen.getByLabelText("Note"),{target:{value:"Unsaved synthetic note"}});
  rerender(<ApplicationCaseForm record={{...original,version:"10000000-0000-4000-8000-000000000099",nextActionCode:"await_documents"}} owners={[]} labels={labels} action={action} refreshHref="/admin/members/queue/example"/>);
  expect(screen.getByLabelText("Note")).toHaveValue("Unsaved synthetic note");expect(container.querySelector('input[name="expectedVersion"]')).toHaveValue(original.version);
 });
});

import {render,screen,fireEvent,waitFor} from "@testing-library/react";
import {afterEach,it,expect,vi} from "vitest";
import {InboxComposer} from "@/components/admin/inbox-composer";
import en from "@/messages/en.json";
const id="11111111-1111-4111-8111-111111111111";
afterEach(()=>window.sessionStorage.clear());
it("typing member contact/payment text never persists plaintext in browser storage",()=>{
 render(<InboxComposer action={async()=>({status:"idle"})} conversationId={id} labels={{...en.Admin.inbox.compose,errors:en.Admin.inbox.errors}} templates={[]} windowMessage="Open" windowState="open"/>);
 const content="Synthetic member other@example.test +85290000001 paid HKD1200";
 fireEvent.change(screen.getByLabelText(en.Admin.inbox.compose.message),{target:{value:content}});
 expect(screen.getByLabelText(en.Admin.inbox.compose.message)).toHaveValue(content);
 expect(Object.values(window.sessionStorage).join(" ")).not.toContain(content);
});
it("legacy unprotected browser text cannot cross into a new staff session",()=>{
 window.sessionStorage.setItem("wtia:inbox-draft:"+id,"Synthetic earlier staff private reply");
 render(<InboxComposer action={async()=>({status:"idle"})} conversationId={id} labels={{...en.Admin.inbox.compose,errors:en.Admin.inbox.errors}} templates={[]} windowMessage="Open" windowState="open"/>);
 expect(screen.getByLabelText(en.Admin.inbox.compose.message)).toHaveValue("");
 expect(window.sessionStorage.getItem("wtia:inbox-draft:"+id)).toBeNull();
});

const scope="a".repeat(64),key="wtia:inbox-protected:"+scope+":"+id;
const protection={scope,enabled:true,protect:vi.fn(async()=>({status:"protected" as const,envelope:"opaque-envelope"})),restore:vi.fn(async()=>({status:"missing" as const}))};
it("deleting all typed text also clears the stored envelope",async()=>{
 protection.protect.mockClear();
 render(<InboxComposer action={async()=>({status:"idle"})} conversationId={id} labels={{...en.Admin.inbox.compose,errors:en.Admin.inbox.errors}} templates={[]} windowMessage="Open" windowState="open" draftProtection={protection}/>);
 fireEvent.change(screen.getByLabelText(en.Admin.inbox.compose.message),{target:{value:"Synthetic private text"}});
 await waitFor(()=>expect(window.sessionStorage.getItem(key)).toBe("opaque-envelope"));
 fireEvent.change(screen.getByLabelText(en.Admin.inbox.compose.message),{target:{value:""}});
 await waitFor(()=>expect(window.sessionStorage.getItem(key)).toBeNull());
});

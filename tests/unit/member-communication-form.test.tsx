import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,describe,expect,it,vi} from "vitest";
const spies=vi.hoisted(()=>({prepare:vi.fn(),push:vi.fn()}));
vi.mock("@/lib/admin/batches/actions",()=>({prepareAdminBatchAction:spies.prepare}));
vi.mock("next/navigation",()=>({useRouter:()=>({push:spies.push})}));
import {MemberCommunicationForm} from "@/components/admin/member-communication-form";
const segmentId="11111111-1111-4111-8111-111111111111";
const membershipId="22222222-2222-4222-8222-222222222222";
const labels={operation:"Action",renewal:"Renewal",invite:"Invite",channel:"Channel",email:"Email",whatsapp:"WhatsApp",help:"Choose one membership per person",selectAll:"Select all",selectAllMatching:"Select matching",selected:"{count} selected",previous:"Previous",next:"Next",name:"Member",scope:"Membership",date:"Renewal date",preview:"Preview",error:"Unable to prepare",empty:"No members",planCodes:{corporate:"Corporate"}};
const targets={members:[{id:"a",name:"Ada",email:"a@example.test"}],renewals:[{id:membershipId,name:"Ada",planCode:"corporate",scope:"Synthetic Company",renewalAt:"2030-10-01T00:00:00Z"}]};
beforeEach(()=>{spies.prepare.mockReset().mockResolvedValue({batchId:segmentId});spies.push.mockReset();});
describe("member communications",()=>{
  it("submits the explicit membership identity and preserves one attempt across a retry",async()=>{
    spies.prepare.mockRejectedValueOnce(new Error("offline"));
    render(<MemberCommunicationForm locale="zh-HK" segmentId={segmentId} targets={targets} labels={labels}/>);
    expect(screen.getByText(/Synthetic Company/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox",{name:"Ada"}));
    fireEvent.click(screen.getByRole("button",{name:"Preview"}));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button",{name:"Preview"}));
    await waitFor(()=>expect(spies.prepare).toHaveBeenCalledTimes(2));
    expect(spies.prepare.mock.calls[0][0]).toEqual(spies.prepare.mock.calls[1][0]);
    expect(spies.prepare.mock.calls[1][0]).toEqual({operation:"renewal_reminder",idempotencyKey:expect.any(String),membershipIds:[membershipId],payload:{channel:"email",segmentId}});
    expect(spies.push).toHaveBeenCalledWith(`/zh/admin/batches/${segmentId}`);
  });
  it("clears membership selection when switching to profile invitations",async()=>{
    render(<MemberCommunicationForm locale="en" segmentId={segmentId} targets={targets} labels={labels}/>);
    fireEvent.click(screen.getByRole("checkbox",{name:"Ada"}));
    fireEvent.change(screen.getByRole("combobox",{name:"Action"}),{target:{value:"profile_update_invite"}});
    expect(screen.getByRole("button",{name:"Preview"})).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox",{name:"Ada"}));
    fireEvent.click(screen.getByRole("button",{name:"Preview"}));
    await waitFor(()=>expect(spies.prepare).toHaveBeenCalledWith({operation:"profile_update_invite",idempotencyKey:expect.any(String),selection:{mode:"ids",profileIds:["a"]},payload:{channel:"email",segmentId}}));
  });
});

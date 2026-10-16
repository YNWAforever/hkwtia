import type Stripe from "stripe";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {reconcileMembershipPayment,type PaymentReconciliationDependencies} from "@/lib/admin/payment-reconciliation";
import type {Membership} from "@/lib/db/server-schema";
const membershipId="20000000-0000-4000-8000-000000000008",applicationId="10000000-0000-4000-8000-000000000008";
const root={kind:"superadmin",profileId:"root-profile",userId:"auth-root"} as const;
const input={requestId:"30000000-0000-4000-8000-000000000008",eventId:"evt_existing123456",reasonCode:"paid_not_active" as const};
function fixture(){
 const event={id:input.eventId,type:"checkout.session.completed",created:1760000000,data:{object:{id:"cs_existing",client_reference_id:membershipId,metadata:{membershipId,applicationId,planCode:"startup"},customer:"cus_existing",subscription:"sub_existing",payment_status:"paid"}}} as unknown as Stripe.Event; // Minimal normalization fixture; actual provider proof is separate.
 const readCorrelation=vi.fn(async():Promise<Membership|null>=>({id:membershipId,applicationId,planCode:"startup",status:"pending_payment"} as Membership));
 const retrieveEvent=vi.fn(async()=>event),process=vi.fn(async()=>"processed" as const);
 const deps:PaymentReconciliationDependencies={readCorrelation,retrieveEvent,process};return {deps,readCorrelation,retrieveEvent,process,event};
}
beforeEach(()=>vi.stubEnv("PAYMENT_RECONCILIATION_ENABLED","true"));afterEach(()=>vi.unstubAllEnvs());
describe("existing payment provider reconciliation",()=>{
 it("retrieves a provider event and reuses the correlated lifecycle instead of accepting client paid claims",async()=>{
  const f=fixture();expect(await reconcileMembershipPayment(root,"profile",membershipId,input,f.deps)).toBe("processed");
  expect(f.retrieveEvent).toHaveBeenCalledWith(input.eventId);expect(f.process).toHaveBeenCalledWith(expect.objectContaining({membershipId,applicationId,stripeCustomerId:"cus_existing",stripeSubscriptionId:"sub_existing",stripeCheckoutSessionId:"cs_existing",nextStatus:"active"}),{actor:root,requestId:input.requestId,reasonCode:"paid_not_active"});
 });
 it.each(["member","staff","exco"] as const)("refuses %s before provider reads",async(kind)=>{
  const f=fixture();await expect(reconcileMembershipPayment({kind,userId:"u",profileId:"p"},"profile",membershipId,input,f.deps)).rejects.toThrow("FORBIDDEN");expect(f.readCorrelation).not.toHaveBeenCalled();expect(f.retrieveEvent).not.toHaveBeenCalled();
 });
 it("keeps the new effectful entry disabled without explicit release configuration",async()=>{
  vi.stubEnv("PAYMENT_RECONCILIATION_ENABLED","false");const f=fixture();await expect(reconcileMembershipPayment(root,"profile",membershipId,input,f.deps)).rejects.toThrow("PAYMENT_RECONCILIATION_DISABLED");expect(f.retrieveEvent).not.toHaveBeenCalled();
 });
 it("refuses a foreign member correlation before provider reads",async()=>{
  const f=fixture();f.readCorrelation.mockResolvedValue(null);await expect(reconcileMembershipPayment(root,"other",membershipId,input,f.deps)).rejects.toThrow("FORBIDDEN");expect(f.retrieveEvent).not.toHaveBeenCalled();
 });
 it.each(["foreignMembership","foreignApplication","unpaid","unsupported","wrongReference"])("does not mutate for %s event",async(shape)=>{
  const f=fixture();const raw=structuredClone(f.event) as unknown as {id:string;type:string;data:{object:Record<string,unknown>}};
  if(shape==="foreignMembership")raw.data.object.metadata={membershipId:"90000000-0000-4000-8000-000000000008",applicationId,planCode:"startup"};
  if(shape==="foreignApplication")raw.data.object.metadata={membershipId,applicationId:"90000000-0000-4000-8000-000000000008",planCode:"startup"};
  if(shape==="unpaid")raw.data.object.payment_status="unpaid";if(shape==="unsupported")raw.type="charge.succeeded";if(shape==="wrongReference")raw.id="evt_other123456";
  f.retrieveEvent.mockResolvedValue(raw as unknown as Stripe.Event);await expect(reconcileMembershipPayment(root,"profile",membershipId,input,f.deps)).rejects.toThrow();expect(f.process).not.toHaveBeenCalled();
 });
 it("does not expand an input with client actor/status/payment fields",async()=>{
  const f=fixture();await expect(reconcileMembershipPayment(root,"profile",membershipId,{...input,paid:true} as typeof input,f.deps)).rejects.toThrow();expect(f.retrieveEvent).not.toHaveBeenCalled();
 });
 it("does not convert a provider outage into successful reconciliation",async()=>{
  const f=fixture();f.retrieveEvent.mockRejectedValue(Error("PROVIDER_UNAVAILABLE"));await expect(reconcileMembershipPayment(root,"profile",membershipId,input,f.deps)).rejects.toThrow("PROVIDER_UNAVAILABLE");expect(f.process).not.toHaveBeenCalled();
 });
});

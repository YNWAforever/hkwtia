import {describe,expect,it,vi} from "vitest";
import {getBillingSummary,type BillingSummaryDependencies} from "@/lib/portal/billing-summary";
import type {Membership} from "@/lib/db/server-schema";
import type {CurrentSubscriptionState} from "@/lib/billing/stripe";
const actor={kind:"member",profileId:"profile",userId:"auth"} as const;
function fixture(patch:Partial<Membership>={}) {
 const row={id:"m",planCode:"startup",status:"expired",companyId:null,ownerUserId:"profile",stripeCustomerId:"cus_own",stripeSubscriptionId:"sub_own",applicationId:"app",...patch} as Membership;
 const current:CurrentSubscriptionState={stripeCustomerId:"cus_own",stripeSubscriptionId:"sub_own",nextStatus:"active",cancelAtPeriodEnd:false,billingPeriodStart:null,billingPeriodEnd:null};
 const read=vi.fn(async()=>current),listBilling=vi.fn(async()=>[row]);
 const dependencies:BillingSummaryDependencies={memberships:{listBilling},stripe:()=>({currentSubscription:read})};
 return {dependencies,read,listBilling};
}
describe("billing recovery independently scoped from entitlement",()=>{
 it.each(["expired","cancelled"] as const)("keeps %s billing accessible without changing entitlement",async(status)=>{
  const f=fixture({status});const summary=await getBillingSummary(actor,f.dependencies);
  expect(f.listBilling).toHaveBeenCalledWith(actor);expect(f.read).toHaveBeenCalledWith("sub_own");
  expect(summary).toMatchObject({membershipId:"m",status,canManageBilling:true,recovery:"resume"});expect(summary.memberships[0].canViewHistory).toBe(true);
 });
 it("offers support and existing invoice history for a provider-cancelled subscription, never a new checkout",async()=>{
  const f=fixture({status:"cancelled"});f.read.mockResolvedValue({...(await f.read()),nextStatus:"cancelled"});
  expect((await getBillingSummary(actor,f.dependencies)).memberships[0]).toMatchObject({recovery:"support",canViewHistory:true});
 });
 it("pending rows with an existing paid subscription require reconciliation",async()=>{
  const f=fixture({status:"pending_payment"});expect((await getBillingSummary(actor,f.dependencies)).recovery).toBe("support");
 });
 it("retains the existing guarded checkout only for an uncorrelated pending paid application",async()=>{
  const f=fixture({status:"pending_payment",stripeSubscriptionId:null,stripeCustomerId:null});expect((await getBillingSummary(actor,f.dependencies)).recovery).toBe("new_checkout");expect(f.read).not.toHaveBeenCalled();
 });
 it.each(["community","patron"] as const)("does not create checkout for %s",async(planCode)=>{
  const f=fixture({planCode,status:"pending_payment",stripeSubscriptionId:null,stripeCustomerId:null});expect((await getBillingSummary(actor,f.dependencies)).recovery).toBe("support");
 });
 it("does not convert a failed provider read into active membership or an empty history",async()=>{
  const f=fixture();f.read.mockRejectedValue(Error("STRIPE_UNAVAILABLE"));const summary=await getBillingSummary(actor,f.dependencies);expect(summary.memberships).toHaveLength(1);expect(summary.memberships[0]).toMatchObject({status:"expired",recovery:"support",providerAvailable:false,canViewHistory:false});
 });
 it("rejects provider customer/subscription correlation without leaking an action",async()=>{
  const f=fixture();f.read.mockResolvedValue({...(await f.read()),stripeCustomerId:"cus_other"});expect((await getBillingSummary(actor,f.dependencies)).memberships[0]).toMatchObject({recovery:"support",canViewHistory:false,providerAvailable:false});
 });
 it("rejects anonymous/admin callers before SQL or provider reads",async()=>{
  const f=fixture();await expect(getBillingSummary({kind:"anonymous",userId:null},f.dependencies)).rejects.toThrow("FORBIDDEN");expect(f.listBilling).not.toHaveBeenCalled();expect(f.read).not.toHaveBeenCalled();
 });
 it("propagates a failed scoped database read instead of pretending there are no bills",async()=>{
  const f=fixture();f.listBilling.mockRejectedValue(Error("DB_READ_FAILED"));await expect(getBillingSummary(actor,f.dependencies)).rejects.toThrow("DB_READ_FAILED");
 });
});

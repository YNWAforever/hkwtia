import "server-only";
import type {DocumentItem} from "@/lib/portal/content";
import {forbidden, requireMember, type Actor, type MembershipRecord} from "@/lib/membership/lifecycle";
import {isBenefitEligibleMembershipStatus} from "@/lib/membership/entitlements";

export type MemberResource = Readonly<{
  id: string; version: number; state: "draft" | "published" | "withdrawn";
  title: string; publishedAt: string | null; planCodes: readonly MembershipRecord["planCode"][];
}>;
export type ResourceDependencies = Readonly<{
  memberships: (actor: Actor) => Promise<readonly MembershipRecord[]>;
  versions: () => Promise<readonly MemberResource[]>;
}>;
/** Contract seam only: no approved owner source or private byte store exists yet. */
export function createMemberResourceReader(deps: ResourceDependencies) {
  async function visible(actor: Actor) {
    requireMember(actor);
    const plans = (await deps.memberships(actor)).filter(m => isBenefitEligibleMembershipStatus(m.status)).map(m => m.planCode);
    if (!plans.length) forbidden();
    const rows = await deps.versions();
    // Resolve latest published/withdrawn version before audience filtering: never revive v1
    // when v2 withdraws or narrows its audience. Draft v2 does not replace published v1.
    const latest = new Map<string, MemberResource>();
    for (const row of rows) if (row.state !== "draft" && row.version > (latest.get(row.id)?.version ?? 0)) latest.set(row.id, row);
    return [...latest.values()].filter(r => r.state === "published" && r.publishedAt && r.planCodes.some(p => plans.includes(p)));
  }
  return {
    async listApproved(actor: Actor): Promise<readonly DocumentItem[]> {
      return (await visible(actor)).map(r => ({id:r.id,title:r.title,kind:"resource",url:null,issuedAt:r.publishedAt,amount:null,currency:null,status:null}));
    },
    async authorizeDownload(actor: Actor, id: string, version: number) {
      const row = (await visible(actor)).find(r => r.id === id && r.version === version);
      if (!row) forbidden();
      return row;
    },
  };
}

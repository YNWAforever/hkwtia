import "server-only";
import {requireMember, type Actor} from "@/lib/membership/lifecycle";
import {getSeatOverview} from "@/lib/portal/seats";

type Target = Readonly<{kind: "member" | "invitation"; id: string}>;
type Reader = (actor: Actor, companyId: string) => Promise<{
  canManage: boolean; members: readonly {id: string}[]; invitations: readonly {id: string}[];
} | null>;

/** The row-level repository still reauthorizes the eventual write under its own lock. */
export async function requireCompanySeatTarget(actor: Actor, companyId: string, target: Target, read: Reader = getSeatOverview): Promise<void> {
  requireMember(actor);
  if (!companyId.trim() || !target.id) throw new Error("FORBIDDEN");
  const overview = await read(actor, companyId);
  const rows = target.kind === "member" ? overview?.members : overview?.invitations;
  if (!overview?.canManage || !rows?.some((row) => row.id === target.id)) throw new Error("FORBIDDEN");
}

import "server-only";

import type {ProfileProvisionResult} from "@/lib/db/repos/profile-identities";

type SubjectSession = {user?: {id?: string | null; email?: string | null; emailVerified?: boolean; name?: string | null}} | null;
type Provision = (input: {authUserId: string; email: string; displayName: string}) => Promise<ProfileProvisionResult>;

/** Only the verified provider session can supply identity; the browser supplies no role or subject. */
export async function provisionVerifiedMember(session: SubjectSession, write: Provision): Promise<ProfileProvisionResult | {kind: "unverified"}> {
  const user = session?.user;
  if (user?.emailVerified !== true || typeof user.id !== "string" || !user.id || typeof user.email !== "string" || !user.email) {
    return {kind: "unverified"};
  }
  return write({authUserId: user.id, email: user.email, displayName: user.name ?? ""});
}

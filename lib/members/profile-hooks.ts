import type {MembershipPlanCode} from "@/lib/membership/constants";
import type {PublicMemberProfile, PublicMemberSummary} from "@/lib/db/repos/company-profiles";

/**
 * The public directory renders companies. This is the shape a later individual
 * profile card can fill without changing `/members` while `people` stays empty.
 */
export type DirectoryPersonProfile = Readonly<{
  displayName: string;
  jobTitle: string | null;
  companyName: string | null;
  plan: MembershipPlanCode | null;
  photoUrl: string | null;
  bio: string | null;
}>;

export type DirectoryCardModel = Readonly<{
  slug: string;
  name: string;
  tagline: PublicMemberSummary["tagline"];
  tags: readonly string[];
  plan: MembershipPlanCode | null;
  website: string | null;
  logoUrl: string | null;
  people: readonly DirectoryPersonProfile[];
}>;

export function directoryCardModel(member: PublicMemberSummary | PublicMemberProfile): DirectoryCardModel {
  return {
    slug: member.slug,
    name: member.name,
    tagline: member.tagline,
    tags: member.tags,
    plan: member.plan,
    website: member.website,
    logoUrl: member.logoUrl,
    people: [],
  };
}

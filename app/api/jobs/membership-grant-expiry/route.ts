import {createJobPost} from "@/lib/jobs/handler";
import {MEMBERSHIP_GRANT_JOB_KIND} from "@/lib/jobs/kinds";
import {expireFiniteGrants} from "@/lib/db/repos/membership-grant-expiry";

export const POST = createJobPost({
  kind: MEMBERSHIP_GRANT_JOB_KIND.EXPIRY,
  bucket: "minute",
  run: async ({now}) => {
    if (process.env.MEMBERSHIP_GRANTS_ENABLED !== "true") return {expired: 0, disabled: true};
    return {expired: await expireFiniteGrants(now)};
  },
});

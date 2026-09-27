import {createJobPost} from "@/lib/jobs/handler";
import {RATE_LIMIT_JOB_KIND} from "@/lib/jobs/kinds";
import {rateLimitRepository} from "@/lib/db/repos/rate-limit";

export const POST = createJobPost({
  kind: RATE_LIMIT_JOB_KIND.CLEANUP,
  bucket: "ten-minute",
  run: async ({now}) => ({removed: await rateLimitRepository.cleanupExpired(now)}),
});

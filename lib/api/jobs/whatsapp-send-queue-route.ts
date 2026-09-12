import {
  createJobPost,
  type JobHandlerRepository,
} from "@/lib/jobs/handler";
import {PHASE_C_JOB_KIND} from "@/lib/jobs/kinds";
import {jobRunners} from "@/lib/jobs/runners";

/**
 * Programme C-5 / D-10, Phase C2 Task 10 Step 6. The ten-minute WhatsApp blast
 * drain.
 *
 * `bucket: "ten-minute"` is the whole of S-12: on an `hourly` run key, ticks 2-6
 * of every hour would claim the key tick 1 already completed, `jobsRepository.claim`
 * would answer `duplicate` (it only ever reclaims a row in state `failed`), and
 * the route would return `200 {"duplicate": true}` — a queue that drains once an
 * hour while every log line says it is healthy.
 *
 * `CRON_SECRET` is one shared bearer across every job route, so anyone holding
 * it can force this one. That is bounded by construction: a forced invocation
 * can only drain what a reviewed campaign already committed to
 * `campaign_recipients`, and every recipient is re-checked against current
 * consent by the dispatcher before a message leaves. It can never ORIGINATE a
 * blast.
 *
 * The route module must not import `@/lib/db/client`: the ESLint boundary rule
 * is scoped to `lib/**` and does not cover `app/**`, so boundary 1 is discipline
 * on the re-export side of this pair.
 */
type WhatsAppSendQueueRouteOptions = Readonly<{
  jobs?: JobHandlerRepository;
  now?: () => Date;
  secret?: () => string | null | undefined;
  runner?: (now: Date) => Promise<unknown>;
}>;

export function createWhatsAppSendQueuePost(
  options: WhatsAppSendQueueRouteOptions = {},
) {
  return createJobPost({
    kind: PHASE_C_JOB_KIND.WHATSAPP_SEND_QUEUE,
    bucket: "ten-minute",
    jobs: options.jobs,
    now: options.now,
    secret: options.secret,
    run: ({now}) =>
      (options.runner ?? jobRunners.whatsappSendQueue)(now),
  });
}

export const POST = createWhatsAppSendQueuePost();

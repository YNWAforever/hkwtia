import {
  createWoztellWebhookProcessor,
  type WoztellProcessResult,
  type WoztellWebhookProcessorDependencies,
} from "@/lib/ai/woztell-webhook";
import {woztellCredentialsFrom} from "@/lib/ai/woztell-credentials";
import {
  createProductionWoztellProcessorDependencies,
} from "@/lib/ai/woztell-production";
import {withDurableWoztellReplyState} from "@/lib/ai/woztell-reply-state";
import type {ChannelAdapter} from "@/lib/channels/types";
import {createWoztellAdapter} from "@/lib/channels/woztell";
import {aiEnv, appEnv} from "@/lib/config/env";
import {readBoundedText} from "@/lib/security/bounded-body";

const MAX_WEBHOOK_BYTES = 64 * 1_024;

type HandlerDependencies = Readonly<{
  channel: Pick<ChannelAdapter, "verifyWebhook">;
  process: (payload: unknown) => Promise<WoztellProcessResult>;
}>;

export function createWoztellWebhookPostHandler(
  dependencies: HandlerDependencies,
) {
  return async function post(request: Request): Promise<Response> {
    // Signature verification is correct and fail-closed, so this is purely a
    // resource bound — it stops an unbounded body being buffered before the
    // signature is even checked.
    let rawBody: string;
    try {
      rawBody = await readBoundedText(request, MAX_WEBHOOK_BYTES);
    } catch {
      return Response.json({error: "PAYLOAD_TOO_LARGE"}, {status: 413});
    }
    const signature = request.headers.get("x-woztell-signature");
    if (!dependencies.channel.verifyWebhook(rawBody, signature)) {
      return Response.json({error: "INVALID_SIGNATURE"}, {status: 401});
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return Response.json({error: "INVALID_REQUEST"}, {status: 400});
    }
    // C-1 Task 4. A throw used to escape into the route runtime, where a webhook
    // POST becomes an unhandled rejection and the provider is told nothing
    // usable. The STOP path writes two legs in two repositories and both are
    // idempotent by design, so a 500 that makes Woztell retry is strictly better
    // than a 202 that drops a consent withdrawal on the floor — and better than a
    // leaked exception either way. Every non-throwing outcome is still 202, and
    // the processor result IS the body: the `reason` / `matched` / `disposition`
    // discriminators are this subsystem's only observability, readable in
    // Woztell's own delivery log without logging a provider body that carries
    // credentials and PII.
    let result: WoztellProcessResult;
    try {
      result = await dependencies.process(payload);
    } catch {
      return Response.json({error: "PROCESSING_FAILED"}, {status: 500});
    }
    return Response.json(result, {status: 202});
  };
}

export function createProductionWoztellWebhookPostHandler(
  dependencies: Readonly<{
    channel: ChannelAdapter;
    processorDependencies: WoztellWebhookProcessorDependencies;
  }>,
) {
  const processor = createWoztellWebhookProcessor(
    dependencies.processorDependencies,
  );
  return createWoztellWebhookPostHandler({
    channel: dependencies.channel,
    process: processor.process,
  });
}

export async function POST(request: Request): Promise<Response> {
  const env = aiEnv();
  const runtimeEnv = {...env, ...appEnv()};
  const channel = createWoztellAdapter({
    // The three conditional spreads that used to be written out here now live in
    // lib/ai/woztell-credentials.ts, because C-2's reply lane is a third
    // construction site and three hand-written copies of "which credentials
    // reach the provider" is three places to audit before C-9.
    // `RUN_LIVE_WOZTELL` stays an explicit argument here, and at every other
    // site, precisely because a helper that supplied it would make forgetting it
    // invisible.
    ...woztellCredentialsFrom(env),
    // C-9 (O-8): the parsed contract, not a bare `process.env` read. `aiEnv()`
    // rejects anything but "0" or "1", so `RUN_LIVE_WOZTELL=true` is now a
    // startup error rather than a silent downgrade to mock mode.
    RUN_LIVE_WOZTELL: env.runLiveWoztell,
  });
  // `await`ed since C-7 (C2 Task 2): the concierge's approved-template set is a
  // registry read in live mode, and the bag carries it as a resolved `Set`.
  const productionDependencies =
    await createProductionWoztellProcessorDependencies(runtimeEnv, channel);
  return createProductionWoztellWebhookPostHandler({
    channel,
    processorDependencies:
      withDurableWoztellReplyState(productionDependencies),
  })(request);
}

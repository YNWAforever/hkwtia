import {
  createWoztellWebhookProcessor,
  type WoztellProcessResult,
  type WoztellWebhookProcessorDependencies,
} from "@/lib/ai/woztell-webhook";
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
    const result = await dependencies.process(payload);
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
    ...(env.woztellApiToken === undefined
      ? {}
      : {WOZTELL_API_TOKEN: env.woztellApiToken}),
    ...(env.woztellChannelId === undefined
      ? {}
      : {WOZTELL_CHANNEL_ID: env.woztellChannelId}),
    ...(env.woztellWebhookSecret === undefined
      ? {}
      : {WOZTELL_WEBHOOK_SECRET: env.woztellWebhookSecret}),
    RUN_LIVE_WOZTELL: process.env.RUN_LIVE_WOZTELL,
  });
  const productionDependencies =
    createProductionWoztellProcessorDependencies(runtimeEnv, channel);
  return createProductionWoztellWebhookPostHandler({
    channel,
    processorDependencies:
      withDurableWoztellReplyState(productionDependencies),
  })(request);
}

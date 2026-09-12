import {createHmac} from "node:crypto";

import {describe, expect, it, vi} from "vitest";

import {WHATSAPP_TEMPLATES} from "@/config/whatsapp-templates";
import {createWoztellAdapter, WOZTELL_REQUEST_TIMEOUT_MS} from "@/lib/channels/woztell";
import {eligibleWhatsAppRecipient, woztellEnv} from "@/tests/fixtures/woztell";

describe("WOZTELL channel adapter", () => {
  it("returns a deterministic mock provider ID without calling fetch when credentials are absent", async () => {
    const fetchImpl = vi.fn();
    const adapter = createWoztellAdapter({}, fetchImpl);

    await expect(adapter.sendTemplateMessage({
      ...eligibleWhatsAppRecipient,
      template: "renewal_14",
      variables: {memberName: "A", renewalDate: "2027-01-01", renewalUrl: "https://example.test/renew"},
      idempotencyKey: "delivery:renewal-14",
    })).resolves.toEqual({status: "sent", providerId: "mock:delivery:renewal-14"});
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the approved renewal D-14 template with its exact mapped variables", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ok: 1,
      sendResult: {ok: 1, result: [{messageEvent: {messageId: "wamid-1"}}]},
    }), {status: 200}));
    const adapter = createWoztellAdapter(woztellEnv, fetchImpl);
    const template = WHATSAPP_TEMPLATES.renewal_14;

    await expect(adapter.sendTemplateMessage({
      ...eligibleWhatsAppRecipient,
      template: "renewal_14",
      variables: {memberName: "A", renewalDate: "2027-01-01", renewalUrl: "https://example.test/renew"},
      idempotencyKey: "delivery:renewal-14",
    })).resolves.toEqual({status: "sent", providerId: "wamid-1"});

    expect(fetchImpl).toHaveBeenCalledWith("https://bot.api.woztell.com/sendResponses", {
      method: "POST",
      headers: {
        authorization: "Bearer woztell-test-token",
        "content-type": "application/json",
      },
      // Asserted as a type rather than a value: the bound itself is pinned
      // against the send-claim lease in tests/unit/inbox-write-repository.test.ts,
      // and its absence is what this expectation is here to catch.
      signal: expect.any(AbortSignal),
      body: JSON.stringify({
        channelId: "channel-123",
        recipientId: "85290000000",
        response: [{
          type: "TEMPLATE",
          elementName: template.name,
          languageCode: template.languageCode,
          components: [{
            type: "body",
            parameters: template.variables.map((key) => ({type: "text", text: ({
              memberName: "A",
              renewalDate: "2027-01-01",
              renewalUrl: "https://example.test/renew",
            })[key]})),
          }],
        }],
      }),
    });
  });

  /**
   * C-2. `lib/db/repos/inbox.ts` leases a send for two minutes and used to
   * justify that by saying it "comfortably exceeds the adapter's own request
   * timeout". This adapter had no such timeout: `fetch` was called with no
   * `signal`, so the real bound was undici's ~300s header timeout — longer than
   * the lease. A send that hangs that long has its claim expire underneath it,
   * the next submit inherits the claim and calls the adapter again, and the
   * member gets the reply twice from one `messages` row.
   */
  it("bounds a send with an abort signal, so the request cannot outlive the send claim", async () => {
    let signal: unknown = "no signal was passed";
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      signal = init.signal;
      return new Response(JSON.stringify({
        ok: 1,
        sendResult: {ok: 1, result: [{messageEvent: {messageId: "wamid-1"}}]},
      }), {status: 200});
    });
    const adapter = createWoztellAdapter(woztellEnv, fetchImpl);

    await expect(adapter.sendSessionMessage({
      ...eligibleWhatsAppRecipient,
      text: "Inside the window.",
      idempotencyKey: "delivery:session",
    })).resolves.toEqual({status: "sent", providerId: "wamid-1"});

    expect(signal).toBeInstanceOf(AbortSignal);
    expect(WOZTELL_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it("actually aborts a request that never answers, and calls that retryable_network", async () => {
    // Driven through the injected bound rather than the real 30 seconds, so the
    // abort path is exercised by a test that finishes. A signal object that is
    // never wired to a timer would satisfy the assertion above and fail here.
    //
    // `retryable_network` and not a definite refusal: a timeout cannot tell a
    // connection that was never made from a response that was never read off a
    // request the provider did process, so `PROVIDER_REFUSED_SEND` must leave
    // the row un-retakeable — otherwise the next Send click re-takes it and
    // WhatsApp delivers the reply twice.
    const adapter = createWoztellAdapter(woztellEnv, async (_url, init) => await new Promise<Response>(
      (_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      },
    ), undefined, 20);

    await expect(adapter.sendSessionMessage({
      ...eligibleWhatsAppRecipient,
      text: "Never answered.",
      idempotencyKey: "delivery:session",
    })).rejects.toMatchObject({code: "retryable_network"});
  });

  it("maps provider failures to a sanitized code without logging sensitive values", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const adapter = createWoztellAdapter(woztellEnv, async () => new Response(
      "recipient 85290000000 token woztell-test-token private-template-variable",
      {status: 503},
    ));

    await expect(adapter.sendSessionMessage({
      ...eligibleWhatsAppRecipient,
      text: "private-template-variable",
      idempotencyKey: "delivery:session",
    })).rejects.toMatchObject({
      code: "provider_acceptance_uncertain",
      message: "WHATSAPP_DELIVERY_FAILED:provider_acceptance_uncertain",
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("normalizes STOP and 取消 as opt-out intent without mutating state", () => {
    const adapter = createWoztellAdapter({}, vi.fn());
    const envelope = {
      from: "85290000000",
      type: "TEXT",
      messageId: "wamid.opt-out",
      timestamp: "2026-07-28T01:00:00.000Z",
    };

    expect(adapter.normalizeInbound({...envelope, data: {text: " STOP "}}))
      .toMatchObject({kind: "message", intent: "opt_out"});
    expect(adapter.normalizeInbound({...envelope, data: {text: "\u53d6\u6d88"}}))
      .toMatchObject({kind: "message", intent: "opt_out"});
  });

  it("verifies WOZTELL signatures and rejects wrong-length signatures through a fixed-length comparison", () => {
    const adapter = createWoztellAdapter(woztellEnv, vi.fn());
    const body = '{"type":"TEXT"}';
    const signature = createHmac("sha256", woztellEnv.WOZTELL_WEBHOOK_SECRET).update(body).digest("base64");

    expect(adapter.verifyWebhook(body, signature)).toBe(true);
    expect(adapter.verifyWebhook(body, "wrong")).toBe(false);
    expect(adapter.verifyWebhook(body, null)).toBe(false);
  });
});

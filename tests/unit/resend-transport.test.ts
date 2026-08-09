import {describe, expect, it, vi} from "vitest";

import {
  createConfiguredResendTransport,
  createResendTransport,
  createConfiguredEmailTransport,
  createPreviewTestTransport,
  createTestTransport,
  DeliveryFailure,
  type EmailSendInput,
} from "@/lib/email/transport";

const input: EmailSendInput = {
  to: "member@example.test",
  from: "WTIA <notifications@notifications.example.test>",
  subject: "Fixture subject",
  html: "<p>Private fixture body</p>",
  text: "Private fixture body",
  headers: {"X-Fixture": "safe"},
  idempotencyKey: "journey:profile-1:welcome",
};

describe("email transports", () => {
  it("passes the stable idempotency key through Resend's options boundary", async () => {
    const providerSend = vi.fn(async () => ({
      data: {id: "email-provider-1"},
      error: null,
    }));
    const transport = createResendTransport({emails: {send: providerSend}});

    await expect(transport.send(input)).resolves.toEqual({
      status: "sent",
      providerId: "email-provider-1",
    });
    expect(providerSend).toHaveBeenCalledWith({
      to: input.to,
      from: input.from,
      subject: input.subject,
      html: input.html,
      text: input.text,
      headers: input.headers,
    }, {idempotencyKey: input.idempotencyKey});
  });

  it("maps provider failures to sanitized delivery codes without logging sensitive data", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const transport = createResendTransport({
      emails: {
        send: async () => ({
          data: null,
          error: {
            name: "rate_limit_exceeded",
            message: "member@example.test Private fixture body provider-secret",
          },
        }),
      },
    });

    let failure: unknown;
    try {
      await transport.send(input);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(DeliveryFailure);
    expect(failure).toMatchObject({code: "retryable_rate_limit"});
    expect((failure as Error).message).toBe("EMAIL_DELIVERY_FAILED:retryable_rate_limit");
    expect((failure as Error).message).not.toMatch(/member@example\.test|Private fixture body|provider-secret/);
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it("maps thrown network failures without exposing the provider response", async () => {
    const transport = createResendTransport({
      emails: {
        send: async () => {
          throw new Error("API key resend-secret failed for member@example.test");
        },
      },
    });

    await expect(transport.send(input)).rejects.toMatchObject({
      code: "retryable_network",
      message: "EMAIL_DELIVERY_FAILED:retryable_network",
    });
  });

  it("keeps dependency-injected test sends only in isolated memory", async () => {
    const first = createTestTransport();
    const second = createTestTransport();

    await expect(first.send(input)).resolves.toEqual({
      status: "sent",
      providerId: "test-email-1",
    });
    expect(first.sends).toEqual([input]);
    expect(second.sends).toEqual([]);
  });

  it("returns a deterministic provider id in explicit Preview test mode", async () => {
    const transport = createPreviewTestTransport();

    await expect(transport.send(input)).resolves.toEqual({
      status: "sent",
      providerId: `test:${input.idempotencyKey}`,
    });
  });

  it("selects deterministic test transport only when explicitly configured", async () => {
    const transport = createConfiguredEmailTransport({
      emailDeliveryMode: "test",
      resendApiKey: "",
    });

    await expect(transport.send(input)).resolves.toEqual({
      status: "sent",
      providerId: `test:${input.idempotencyKey}`,
    });
  });

  it("loads configured transports from the email contract without unrelated production secrets", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_test_example");
    vi.stubEnv("EMAIL_FROM", "WTIA <notifications@example.test>");

    expect(() => createConfiguredResendTransport()).not.toThrow();
    expect(() => createConfiguredEmailTransport()).not.toThrow();
  });
});

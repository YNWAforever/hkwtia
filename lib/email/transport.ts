import "server-only";

import {Resend} from "resend";

import {serverEnv} from "@/lib/config/env";

export type EmailSendInput = Readonly<{
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  headers: Readonly<Record<string, string>>;
  idempotencyKey: string;
}>;

export type DeliveryResult = Readonly<{
  status: "sent";
  providerId: string;
}>;

export type DeliveryFailureCode =
  | "retryable_network"
  | "retryable_rate_limit"
  | "retryable_server"
  | "provider_client_error"
  | "provider_unclassified_failure";

export class DeliveryFailure extends Error {
  readonly code: DeliveryFailureCode;

  constructor(code: DeliveryFailureCode) {
    super(`EMAIL_DELIVERY_FAILED:${code}`);
    this.name = "DeliveryFailure";
    this.code = code;
  }
}

export interface EmailTransport {
  send(input: EmailSendInput): Promise<DeliveryResult>;
}

type ProviderError = Readonly<{name: string; message: string}>;
type ProviderResult = Readonly<{
  data: Readonly<{id: string}> | null;
  error: ProviderError | null;
}>;
type ResendLike = Readonly<{
  emails: Readonly<{
    send(
      payload: Readonly<{
        to: string;
        from: string;
        subject: string;
        html: string;
        text: string;
        headers: Readonly<Record<string, string>>;
      }>,
      options: Readonly<{idempotencyKey: string}>,
    ): Promise<ProviderResult>;
  }>;
}>;

function providerFailureCode(name: string): DeliveryFailureCode {
  if (name === "rate_limit_exceeded") return "retryable_rate_limit";
  if (name === "application_error" || name === "internal_server_error") {
    return "retryable_server";
  }
  if (
    name === "validation_error"
    || name === "missing_required_field"
    || name === "invalid_parameter"
    || name === "restricted_api_key"
  ) {
    return "provider_client_error";
  }
  return "provider_unclassified_failure";
}

export function createResendTransport(resend: ResendLike): EmailTransport {
  return {
    async send(input) {
      let result: ProviderResult;
      try {
        result = await resend.emails.send({
          to: input.to,
          from: input.from,
          subject: input.subject,
          html: input.html,
          text: input.text,
          headers: input.headers,
        }, {idempotencyKey: input.idempotencyKey});
      } catch {
        throw new DeliveryFailure("retryable_network");
      }

      if (result.error) {
        throw new DeliveryFailure(providerFailureCode(result.error.name));
      }
      if (!result.data?.id) {
        throw new DeliveryFailure("provider_unclassified_failure");
      }
      return {status: "sent", providerId: result.data.id};
    },
  };
}

export function createConfiguredResendTransport(): EmailTransport {
  const resend = new Resend(serverEnv().resendApiKey);
  return createResendTransport({
    emails: {
      async send(payload, options) {
        const result = await resend.emails.send(payload, options);
        return {
          data: result.data ? {id: result.data.id} : null,
          error: result.error ? {
            name: result.error.name,
            message: result.error.message,
          } : null,
        };
      },
    },
  });
}

export type TestEmailTransport = EmailTransport & Readonly<{
  sends: EmailSendInput[];
}>;

export function createTestTransport(): TestEmailTransport {
  const sends: EmailSendInput[] = [];
  return {
    sends,
    async send(input) {
      sends.push(structuredClone(input));
      return {status: "sent", providerId: `test-email-${sends.length}`};
    },
  };
}

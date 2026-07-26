import {describe, expect, it, vi} from "vitest";

import {createWoztellAdapter} from "@/lib/channels/woztell";
import {woztellEnv} from "@/tests/fixtures/woztell";

describe("WhatsApp delivery eligibility", () => {
  it.each([
    {whatsappOptIn: false, whatsappNumber: "85290000000"},
    {whatsappOptIn: true, whatsappNumber: "   "},
    {whatsappOptIn: true, whatsappNumber: null},
  ])("skips without a provider call or delivery payload when the recipient is ineligible", async (recipient) => {
    const fetchImpl = vi.fn();
    const adapter = createWoztellAdapter(woztellEnv, fetchImpl);

    await expect(adapter.sendTemplateMessage({
      ...recipient,
      template: "dunning_3",
      variables: {memberName: "A", amountDue: "HK$100", paymentUrl: "https://example.test/pay"},
      idempotencyKey: "delivery:dunning-3",
    })).resolves.toEqual({status: "skipped", reason: "recipient_ineligible"});
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

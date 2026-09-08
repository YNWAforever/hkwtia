import {describe, expect, it} from "vitest";

import {normalizeWhatsAppNumber} from "@/lib/whatsapp/number";
import {normalizeWhatsAppNumber as viaAdapter} from "@/lib/channels/woztell";

describe("normalizeWhatsAppNumber", () => {
  it("keeps digits only and prefixes +", () => {
    expect(normalizeWhatsAppNumber("+852 9123 4567")).toBe("+85291234567");
    expect(normalizeWhatsAppNumber("(852) 9123-4567")).toBe("+85291234567");
  });
  it("rejects too short or too long input", () => {
    expect(normalizeWhatsAppNumber("1234567")).toBeNull();
    expect(normalizeWhatsAppNumber("1234567890123456")).toBeNull();
  });
  it("is the same function the Woztell adapter exports", () => {
    expect(viaAdapter).toBe(normalizeWhatsAppNumber);
  });
});

import {describe, expect, it} from "vitest";

import {formatTicketPrice} from "@/lib/tickets/format";

describe("formatTicketPrice", () => {
  it("renders integer HKD cents as HK dollars in both locales", () => {
    expect(formatTicketPrice(25_000, "en")).toBe("HK$250.00");
    expect(formatTicketPrice(25_000, "zh-HK")).toBe("HK$250.00");
  });

  it("renders an absent price as HK$0.00 rather than as null", () => {
    expect(formatTicketPrice(null, "en")).toBe("HK$0.00");
    expect(formatTicketPrice(null, "zh-HK")).toBe("HK$0.00");
  });
});

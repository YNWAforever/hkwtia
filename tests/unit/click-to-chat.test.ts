import {describe, expect, it} from "vitest";

import {clickToChatUrl} from "@/lib/whatsapp/click-to-chat";

describe("clickToChatUrl", () => {
  it("builds a wa.me link with digits only and an encoded prefilled message", () => {
    const url = clickToChatUrl({number: "+852 9123 4567", text: "Hi WTIA, I'd like to know more about membership. [web:contact:en]"});
    expect(url).toBe("https://wa.me/85291234567?text=Hi%20WTIA%2C%20I'd%20like%20to%20know%20more%20about%20membership.%20%5Bweb%3Acontact%3Aen%5D");
  });
  it("returns null when no number is configured", () => {
    expect(clickToChatUrl({number: undefined, text: "x"})).toBeNull();
  });
});

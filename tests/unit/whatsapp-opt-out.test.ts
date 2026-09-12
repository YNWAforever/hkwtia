import {describe, expect, it} from "vitest";

import {isOptOutText, OPT_OUT_TOKENS} from "@/lib/whatsapp/opt-out";

describe("WhatsApp opt-out vocabulary (D-7, plan S-11)", () => {
  it("accepts the closed token list after trimming and stripping end punctuation", () => {
    for (
      const token of [
        "STOP",
        "stop",
        " Stop. ",
        "取消",
        "取消。",
        "退訂",
        "停止",
        "UNSUBSCRIBE",
        "opt out",
        "OPTOUT",
        "取消訂閱",
      ]
    ) {
      expect(isOptOutText(token), token).toBe(true);
    }
  });

  it("never matches a substring, because 'stop sending me the newsletter' is not consent withdrawal for everything", () => {
    for (
      const text of [
        "stop sending me the newsletter",
        "please stop the renewal emails",
        "Can you stop by tomorrow?",
        "取消我的活動報名",
        "no",
      ]
    ) {
      expect(isOptOutText(text), text).toBe(false);
    }
  });

  it("keeps the vocabulary closed so widening it is a reviewed change", () => {
    expect(OPT_OUT_TOKENS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(OPT_OUT_TOKENS).size).toBe(OPT_OUT_TOKENS.length);
  });

  it("treats an empty or punctuation-only message as ordinary text, not as withdrawal", () => {
    // A blank string would strip to "" and, if "" ever reached the token set,
    // would opt a member out on an empty payload. The set is checked against the
    // stripped value, so the guard is that "" is not a member of it.
    for (const text of ["", "   ", ".", "。", "!!!"]) {
      expect(isOptOutText(text), JSON.stringify(text)).toBe(false);
    }
  });
});

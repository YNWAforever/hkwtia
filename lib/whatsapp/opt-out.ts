/**
 * D-7 / plan S-11. Exact whole-string tokens, never a substring: matching any
 * message containing "stop" would opt a member out of everything because they
 * asked us to stop one thing. The old rule — `text.toUpperCase() === "STOP" ||
 * text === "取消"` in lib/channels/woztell.ts — went the other way and missed
 * "Stop.", "unsubscribe" and 退訂, which is most of what a real person types.
 * Widening this list is a reviewed change with a test, not a regex tweak.
 */
export const OPT_OUT_TOKENS = Object.freeze([
  "STOP",
  "UNSUBSCRIBE",
  "OPT OUT",
  "OPTOUT",
  "取消",
  "退訂",
  "停止",
  "取消訂閱",
] as const);

const TRAILING_PUNCTUATION = /[.。!！?？\s]+$/u;
const tokens = new Set<string>(OPT_OUT_TOKENS);

/**
 * `toUpperCase()` is a no-op for the CJK tokens and correct for the latin ones,
 * so one comparison covers both scripts. "OPT OUT" keeps its single interior
 * space: only *trailing* punctuation and whitespace are stripped, because a
 * message's interior is meaning, not noise.
 */
export function isOptOutText(text: string): boolean {
  return tokens.has(text.trim().replace(TRAILING_PUNCTUATION, "").toUpperCase());
}

import type {MemberToolsEnv} from "../lib/config/env";
import type {MembershipPlanCode} from "../lib/membership/constants";

/**
 * One external member tool, embedded in the portal (programme D-2).
 *
 * `url` is the tool's origin only. The access token is NOT here: it comes from the
 * environment through `tokenField`, and `toolFrameSrc` appends it at render time, so no
 * secret is stored in this file, in git, or in a client bundle.
 */
export type MemberTool = Readonly<{
  key: string;
  titleKey: string;
  url: string;
  tokenParam: string;
  tokenField: keyof MemberToolsEnv;
  tiers: readonly MembershipPlanCode[];
}>;

/**
 * Every tool the portal offers.
 *
 * Imported by `next.config.ts` for the CSP `frame-src` list, so this module must stay
 * importable outside the Next runtime: relative imports only, and type-only imports for
 * anything from `lib/config/env.ts` (which begins with `import "server-only"`).
 */
export const MEMBER_TOOLS: readonly MemberTool[] = Object.freeze([
  Object.freeze({
    key: "content-calendar",
    titleKey: "tools.contentCalendar.title",
    url: "https://content-calendar-internal.vercel.app/",
    tokenParam: "token",
    tokenField: "contentCalendarToken",
    tiers: Object.freeze(["startup", "corporate", "patron"] as const),
  }),
]);

/**
 * The distinct origins of the configured tools, for `next.config.ts`'s `frame-src`.
 *
 * Derived rather than written twice: a tool cannot be declared without its host being
 * allowed to be framed, and removing a tool removes its host in the same edit.
 */
export const memberToolOrigins: readonly string[] = Object.freeze([
  ...new Set(MEMBER_TOOLS.map((tool) => new URL(tool.url).origin)),
]);

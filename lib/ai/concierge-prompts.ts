export const conciergePromptSections = ["home", "membership", "showcase", "events"] as const;
export type ConciergePromptSection = typeof conciergePromptSections[number];
export type ConciergePrompts = Readonly<Record<ConciergePromptSection, readonly string[]>>;

/**
 * The donor branches on `path[0]` with `membership|join`, `members`, `events` and a default
 * (app/WiseTechSite.tsx `:1041-1044`). hkwtia merges the donor's members and solutions
 * sections into `/showcase` (D-3), so that donor branch supplies the showcase pair.
 * `pathname` may still carry the `/zh` prefix here: the Concierge reads it from
 * `window.location`, not from `usePathname`, so the widget needs no router hook.
 */
export function resolveConciergePromptSection(pathname: string): ConciergePromptSection {
  const withoutLocale = pathname.startsWith("/zh/") ? pathname.slice(3) : pathname === "/zh" ? "/" : pathname;
  const segment = withoutLocale.split("/").filter(Boolean)[0];
  if (segment === "membership" || segment === "join") return "membership";
  if (segment === "showcase") return "showcase";
  if (segment === "events") return "events";
  return "home";
}

function promptPair(value: unknown): readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.trim().length > 0)
    ? (value as readonly string[])
    : [];
}

/** `raw` is next-intl's `t.raw` for the `Concierge` namespace; the values are arrays. */
export function localizeConciergePrompts(raw: (key: string) => unknown): ConciergePrompts {
  return Object.fromEntries(
    conciergePromptSections.map((section) => [section, promptPair(raw(`prompts.${section}`))]),
  ) as ConciergePrompts;
}

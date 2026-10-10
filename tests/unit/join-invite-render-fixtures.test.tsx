/**
 * Fixture writer for tests/e2e/join-invite.spec.ts. RUN THIS FIRST:
 *
 *   npx vitest run tests/unit/join-invite-render-fixtures.test.tsx
 *   PLAYWRIGHT_BASE_URL=http://localhost:9 npx playwright test tests/e2e/join-invite.spec.ts --project=chromium
 *
 * Same pattern as portal-render-fixtures.test.tsx: Playwright cannot mock the repositories or
 * next-intl's request scope, so the invite page is rendered here against mocked reads and the real
 * catalogues, wrapped in the (join) layout's <main>, and written to .tmp/join-invite-fixtures/
 * (git-ignored). The fixtures carry the sample lead's name so the spec can prove the invalid page
 * does not.
 */
import {mkdirSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";

import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({locale: "en" as "en" | "zh-HK", invite: null as unknown}));

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", async () => {
  const {createTranslator} = await import("next-intl");
  const {default: en} = await import("@/messages/en.json");
  const {default: zhHK} = await import("@/messages/zh-HK.json");
  const catalogue = (locale: string) => (locale === "zh-HK" ? zhHK : en) as typeof en;
  return {
    getTranslations: vi.fn(async (options?: string | {locale?: string; namespace?: string}) => {
      const {locale = state.locale, namespace} = typeof options === "string" ? {namespace: options} : options ?? {};
      return createTranslator({locale, messages: catalogue(locale), namespace: namespace as never});
    }),
    setRequestLocale: vi.fn(),
  };
});
vi.mock("next/headers", () => ({headers: async () => new Headers({"x-real-ip": "203.0.113.77"})}));
vi.mock("@/lib/db/repos/join-invites", () => ({joinInvitesRepository: {peek: async () => state.invite}}));
vi.mock("@/lib/db/repos/membership-plans", () => ({membershipPlansRepository: {list: async () => []}}));
vi.mock("@/lib/membership/public-catalog", () => ({
  publicPriceIds: () => ({startup: "p", corporate: "q"}),
  buildPublicMembershipCatalog: () => [
    {code: "startup", price: {kind: "paid", options: [{amount: "HK$2,000", cadence: "annual"}]}, cta: {href: "/join?plan=startup", kind: "join"}},
  ],
}));

import InvitePage from "@/app/[locale]/(join)/join/invite/[token]/page";

const TOKEN = "A".repeat(43);
const outDir = resolve(process.cwd(), ".tmp/join-invite-fixtures");
const opened = {
  inviteId: "3f0e7a52-1c7e-4a43-9a52-6f1f6f2c9b10", planCode: "startup", contactDisplayName: "Chan Tai Man",
  inviterFirstName: "Willy", locale: "en", expiresAt: new Date("2026-11-01T00:00:00.000Z"),
};

async function write(name: string, locale: "en" | "zh-HK", invite: unknown, token = TOKEN) {
  state.locale = locale;
  state.invite = invite;
  const body = renderToStaticMarkup(await InvitePage({params: Promise.resolve({locale, token})}));
  mkdirSync(outDir, {recursive: true});
  writeFileSync(
    resolve(outDir, `${name}.html`),
    `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title></head>` +
      `<body><div class="min-h-screen bg-background text-foreground"><main class="mx-auto max-w-3xl px-6 py-10 sm:py-16">${body}</main></div></body></html>`,
  );
  return body;
}

describe("join invite render fixtures", () => {
  it("writes the welcome page in English and Traditional Chinese", async () => {
    expect(await write("welcome-en", "en", opened)).toContain("Chan Tai Man");
    expect(await write("welcome-zh", "zh-HK", opened)).toContain("Chan Tai Man");
  });

  it("writes the invalid page, which carries no contact data", async () => {
    const en = await write("invalid-en", "en", null);
    const zh = await write("invalid-zh", "zh-HK", null);
    for (const html of [en, zh]) {
      expect(html).not.toContain("Chan Tai Man");
      expect(html).not.toContain("Willy");
    }
  });
});

// @vitest-environment node
await vi.hoisted(async()=>{const {AsyncLocalStorage}=await import("node:async_hooks");Object.assign(globalThis,{AsyncLocalStorage});});
import {beforeEach, describe, expect, it, vi} from "vitest";

import {nextDataCacheStore} from "@/tests/helpers/next-data-cache";
const store=nextDataCacheStore();
Object.assign(globalThis,{__incrementalCache:store});
vi.mock("next/cache",async importOriginal=>({...await importOriginal<typeof import("next/cache")>(),revalidateTag:(tag:string)=>store.expire(tag)}));

const repository = vi.hoisted(() => ({listPageCopyForLocale: vi.fn()}));

vi.mock("@/lib/db/repos/page-copy", () => repository);
// jsdom resolves next-intl to its client build, which refuses getRequestConfig.
// The react-server build is the identity function, so this stands in for it and
// lets the test drive the real config factory.
vi.mock("next-intl/server", () => ({
  getRequestConfig: <T,>(factory: T) => factory,
}));

import getConfig from "@/i18n/request";
import {clearPageCopyCache} from "@/lib/i18n/page-copy-cache";

async function config(locale: string) {
  return getConfig({
    requestLocale: Promise.resolve(locale),
    locale,
  } as never) as Promise<{locale: string; messages: unknown}>;
}

/** Walks the merged tree without asserting a shape the message bundle owns. */
function node(messages: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (cursor, key) => (typeof cursor === "object" && cursor !== null
      ? (cursor as Record<string, unknown>)[key]
      : undefined),
    messages,
  );
}

describe("getRequestConfig with staff page copy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPageCopyCache();
    repository.listPageCopyForLocale.mockResolvedValue([]);
  });

  it("serves the shipped bundle when there is nothing overridden", async () => {
    const {locale, messages} = await config("en");

    expect(locale).toBe("en");
    expect(node(messages, "Privacy.title")).toBeTruthy();
    expect(node(messages, "_review")).toBeUndefined();
  });

  it("substitutes an override and leaves t.raw() arrays intact", async () => {
    repository.listPageCopyForLocale.mockResolvedValue([
      {namespace: "Privacy", keyPath: "sections.0.heading", value: "What we collect from you"},
    ]);

    const {messages} = await config("en");

    expect(node(messages, "Privacy.sections.0.heading")).toBe("What we collect from you");
    expect(Array.isArray(node(messages, "Privacy.sections"))).toBe(true);
    expect(Array.isArray(node(messages, "Privacy.sections.0.body"))).toBe(true);
  });

  it("keeps the Chinese bundle value when only English is overridden", async () => {
    const shipped = node((await config("zh-HK")).messages, "Privacy.title");
    clearPageCopyCache();
    repository.listPageCopyForLocale.mockImplementation(async (locale: string) =>
      locale === "en" ? [{namespace: "Privacy", keyPath: "title", value: "Our privacy notice"}] : []);

    expect(node((await config("en")).messages, "Privacy.title")).toBe("Our privacy notice");
    expect(node((await config("zh-HK")).messages, "Privacy.title")).toBe(shipped);
  });

  it("strips the Chinese review flag before it reaches a call site", async () => {
    expect(node((await config("zh-HK")).messages, "_review")).toBeUndefined();
  });

  it("falls back to the default locale for an unknown one", async () => {
    expect((await config("fr")).locale).toBe("en");
  });

  it("serves shipped copy when the repository throws, so the build still succeeds", async () => {
    repository.listPageCopyForLocale.mockRejectedValue(new Error("DATABASE_URL_MISSING"));

    const {messages} = await config("en");

    expect(node(messages, "Privacy.title")).toBeTruthy();
    expect(Array.isArray(node(messages, "Privacy.sections"))).toBe(true);
  });

  it("ignores an override the bundle no longer has a key for", async () => {
    repository.listPageCopyForLocale.mockResolvedValue([
      {namespace: "Privacy", keyPath: "sections.99.heading", value: "Retired"},
    ]);

    const {messages} = await config("en");

    expect(JSON.stringify(messages)).not.toContain("Retired");
  });
});

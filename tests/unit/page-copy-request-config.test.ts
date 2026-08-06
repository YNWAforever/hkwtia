import {beforeEach, describe, expect, it, vi} from "vitest";

const repository = vi.hoisted(() => ({listPageCopyForLocale: vi.fn()}));

vi.mock("@/lib/db/repos/page-copy", () => repository);
// jsdom resolves next-intl to its client build, which refuses getRequestConfig.
// The react-server build is the identity function, so this stands in for it and
// lets the test drive the real config factory.
vi.mock("next-intl/server", () => ({
  getRequestConfig: <T,>(factory: T) => factory,
}));

import getConfig from "@/i18n/request";
import {clearPageCopyCache, pageCopyOverrides} from "@/lib/i18n/page-copy-cache";

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

describe("page copy cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPageCopyCache();
  });

  it("serves a second read from cache and refetches once the entry expires", async () => {
    const load = vi.fn(async () => []);
    let clock = 0;
    const now = () => clock;

    await pageCopyOverrides("en", {load, now});
    await pageCopyOverrides("en", {load, now});
    expect(load).toHaveBeenCalledOnce();

    clock = 30_001;
    await pageCopyOverrides("en", {load, now});
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("caches each locale separately", async () => {
    const load = vi.fn(async () => []);

    await pageCopyOverrides("en", {load});
    await pageCopyOverrides("zh-HK", {load});

    expect(load.mock.calls).toEqual([["en"], ["zh-HK"]]);
  });

  it("collapses concurrent misses into one read", async () => {
    const load = vi.fn(async () => []);

    await Promise.all([
      pageCopyOverrides("en", {load}),
      pageCopyOverrides("en", {load}),
      pageCopyOverrides("en", {load}),
    ]);

    expect(load).toHaveBeenCalledOnce();
  });

  it("retries sooner after a failure than after a success", async () => {
    let clock = 0;
    const now = () => clock;
    const load = vi.fn(async () => {
      throw new Error("DB_DOWN");
    });

    await expect(pageCopyOverrides("en", {load, now})).resolves.toEqual([]);
    clock = 4_999;
    await pageCopyOverrides("en", {load, now});
    expect(load).toHaveBeenCalledOnce();

    clock = 5_001;
    await pageCopyOverrides("en", {load, now});
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("drops the cached entry when a save clears it", async () => {
    const load = vi.fn(async () => []);

    await pageCopyOverrides("en", {load});
    clearPageCopyCache();
    await pageCopyOverrides("en", {load});

    expect(load).toHaveBeenCalledTimes(2);
  });
});

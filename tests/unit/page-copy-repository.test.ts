import {describe, expect, it, vi} from "vitest";

import {
  listPageCopyForAdmin,
  listPageCopyForLocale,
  savePageCopy,
  type PageCopyEntry,
  type PageCopyMutationDependencies,
  type PageCopyReadDependencies,
} from "@/lib/db/repos/page-copy";

const staff = {kind: "staff", userId: "user-staff", profileId: "profile-staff"} as const;
const member = {kind: "member", userId: "user-member", profileId: "profile-member"} as const;
const anonymous = {kind: "anonymous", userId: null} as const;

const heading = "sections.0.heading";
const body = "sections.0.body.0";

function mutationDependencies(stored: readonly PageCopyEntry[] = []) {
  const audits: {action: string; metadata: Record<string, unknown>}[] = [];
  const transaction = {
    listForNamespace: vi.fn(async () => stored),
    upsert: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    insertAudit: vi.fn(async (input: {action: string; metadata: Record<string, unknown>}) => {
      audits.push(input);
    }),
  };
  const dependencies: PageCopyMutationDependencies = {
    transaction: (work) => work(transaction as never),
  };
  return {dependencies, transaction, audits};
}

function row(overrides: Partial<PageCopyEntry> = {}): PageCopyEntry {
  return {locale: "en", namespace: "Privacy", keyPath: heading, value: "Stored", ...overrides};
}

describe("page copy repository", () => {
  it.each([
    ["member", member],
    ["anonymous", anonymous],
  ])("refuses %s before opening a transaction", async (_name, actor) => {
    const {dependencies, transaction} = mutationDependencies();
    const spy = vi.spyOn(dependencies, "transaction");

    await expect(savePageCopy(actor as never, {
      namespace: "Privacy", entries: [{locale: "en", keyPath: heading, value: "x"}],
    }, dependencies)).rejects.toThrow("FORBIDDEN");
    await expect(listPageCopyForAdmin(actor as never, {
      listForLocale: async () => [], listAll: async () => [],
    })).rejects.toThrow("FORBIDDEN");

    expect(spy).not.toHaveBeenCalled();
    expect(transaction.upsert).not.toHaveBeenCalled();
  });

  it("writes both locales in one transaction and audits what changed", async () => {
    const {dependencies, transaction, audits} = mutationDependencies();

    await expect(savePageCopy(staff, {
      namespace: "Privacy",
      entries: [
        {locale: "en", keyPath: heading, value: "What we collect about you"},
        {locale: "zh-HK", keyPath: heading, value: "我們收集的資料"},
      ],
    }, dependencies)).resolves.toEqual({updated: 2, cleared: 0});

    expect(transaction.upsert).toHaveBeenCalledTimes(2);
    expect(transaction.upsert).toHaveBeenCalledWith({
      locale: "en",
      namespace: "Privacy",
      keyPath: heading,
      value: "What we collect about you",
      updatedByProfileId: "profile-staff",
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toBe("page_copy.updated");
    expect(audits[0]?.metadata).toEqual({
      namespace: "Privacy",
      updated: [`en:${heading}`, `zh-HK:${heading}`],
      cleared: [],
    });
  });

  it("writes nothing and audits nothing when no value differs", async () => {
    const {dependencies, transaction, audits} = mutationDependencies([row({value: "Stored"})]);

    await expect(savePageCopy(staff, {
      namespace: "Privacy",
      entries: [
        {locale: "en", keyPath: heading, value: "Stored"},
        {locale: "zh-HK", keyPath: body, value: ""},
      ],
    }, dependencies)).resolves.toEqual({updated: 0, cleared: 0});

    expect(transaction.upsert).not.toHaveBeenCalled();
    expect(transaction.remove).not.toHaveBeenCalled();
    expect(audits).toEqual([]);
  });

  it("clears an override so the page falls back to its bundle value", async () => {
    const {dependencies, transaction, audits} = mutationDependencies([row()]);

    await expect(savePageCopy(staff, {
      namespace: "Privacy", entries: [{locale: "en", keyPath: heading, value: "   "}],
    }, dependencies)).resolves.toEqual({updated: 0, cleared: 1});

    expect(transaction.remove).toHaveBeenCalledWith("en", "Privacy", heading);
    expect(audits[0]?.metadata).toMatchObject({cleared: [`en:${heading}`], updated: []});
  });

  it("leaves the other locale's override alone when only one is cleared", async () => {
    const {dependencies, transaction} = mutationDependencies([
      row({locale: "en"}),
      row({locale: "zh-HK", value: "已儲存"}),
    ]);

    await savePageCopy(staff, {
      namespace: "Privacy",
      entries: [
        {locale: "en", keyPath: heading, value: ""},
        {locale: "zh-HK", keyPath: heading, value: "已儲存"},
      ],
    }, dependencies);

    expect(transaction.remove).toHaveBeenCalledExactlyOnceWith("en", "Privacy", heading);
    expect(transaction.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["an out-of-scope namespace", {namespace: "LaunchPad", entries: [{locale: "en", keyPath: "applyCta", value: "Join"}]}],
    ["an unknown key path", {namespace: "Privacy", entries: [{locale: "en", keyPath: "sections.0.body.99", value: "x"}]}],
    ["a path escaping the namespace", {namespace: "Privacy", entries: [{locale: "en", keyPath: "__proto__", value: "x"}]}],
    ["an unknown locale", {namespace: "Privacy", entries: [{locale: "fr", keyPath: heading, value: "x"}]}],
    ["a malformed key path", {namespace: "Privacy", entries: [{locale: "en", keyPath: "../secret", value: "x"}]}],
    ["a duplicated key path", {namespace: "Privacy", entries: [
      {locale: "en", keyPath: heading, value: "a"},
      {locale: "en", keyPath: heading, value: "b"},
    ]}],
    ["an unexpected field", {namespace: "Privacy", entries: [{locale: "en", keyPath: heading, value: "x", id: "1"}]}],
  ])("rejects %s before writing anything", async (_case, input) => {
    const {dependencies, transaction} = mutationDependencies();

    await expect(savePageCopy(staff, input, dependencies)).rejects.toThrow();
    expect(transaction.upsert).not.toHaveBeenCalled();
    expect(transaction.remove).not.toHaveBeenCalled();
  });

  it("names the offending key path so the editor can point at the field", async () => {
    const {dependencies} = mutationDependencies();

    await expect(savePageCopy(staff, {
      namespace: "Privacy", entries: [{locale: "en", keyPath: "sections.0.body.99", value: "x"}],
    }, dependencies)).rejects.toMatchObject({
      issues: [expect.objectContaining({
        path: ["sections.0.body.99"], message: "KEY_PATH_UNKNOWN",
      })],
    });
  });

  it("reads overrides for one locale without an actor and drops retired namespaces", async () => {
    const reads: PageCopyReadDependencies = {
      listForLocale: vi.fn(async () => [
        row({keyPath: heading, value: "Kept"}),
        row({namespace: "LaunchPad", keyPath: "applyCta", value: "Dropped"}),
      ]),
      listAll: vi.fn(async () => []),
    };

    await expect(listPageCopyForLocale("en", reads)).resolves.toEqual([
      {namespace: "Privacy", keyPath: heading, value: "Kept"},
    ]);
    expect(reads.listForLocale).toHaveBeenCalledWith("en");
  });

  it("returns nothing for an unknown locale without querying", async () => {
    const reads: PageCopyReadDependencies = {
      listForLocale: vi.fn(async () => []),
      listAll: vi.fn(async () => []),
    };

    await expect(listPageCopyForLocale("fr", reads)).resolves.toEqual([]);
    expect(reads.listForLocale).not.toHaveBeenCalled();
  });
});

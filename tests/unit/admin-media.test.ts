import {describe, expect, it, vi} from "vitest";

import {
  createMedia,
  getMediaForAdmin,
  listMediaForAdmin,
  updateMedia,
  type MediaMutationDependencies,
  type MediaReadDependencies,
} from "@/lib/db/repos/media";

const staff = {kind: "staff", userId: "user-staff", profileId: "profile-staff"} as const;
const member = {kind: "member", userId: "user-member", profileId: "profile-member"} as const;
const anonymous = {kind: "anonymous", userId: null} as const;

const validInput = {
  url: "/images/showcase/harbour-vision-ai.png",
  altEn: "Harbour Vision AI logo",
  altZh: "Harbour Vision AI 標誌",
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ...validInput,
    registeredByProfileId: "profile-staff",
    createdAt: new Date("2026-08-06T00:00:00.000Z"),
    updatedAt: new Date("2026-08-06T00:00:00.000Z"),
    ...overrides,
  };
}

function mutationDependencies(overrides: Record<string, unknown> = {}) {
  const audits: {action: string; metadata: Record<string, unknown>}[] = [];
  const transaction = {
    findByUrl: vi.fn(async () => null),
    insertMedia: vi.fn(async (input: Record<string, unknown>) => row(input)),
    lockMedia: vi.fn(async () => row()),
    updateMedia: vi.fn(async (_id: string, input: Record<string, unknown>) => row(input)),
    countListingReferences: vi.fn(async () => 0),
    countEventHeroReferences: vi.fn(async () => 0),
    insertAudit: vi.fn(async (input: {action: string; metadata: Record<string, unknown>}) => {
      audits.push(input);
    }),
    ...overrides,
  };
  const dependencies: MediaMutationDependencies = {
    transaction: (work) => work(transaction as never),
  };
  return {dependencies, transaction, audits};
}

describe("media registry repository", () => {
  it.each([
    ["member", member],
    ["anonymous", anonymous],
  ])("refuses %s before opening a transaction", async (_name, actor) => {
    const {dependencies, transaction} = mutationDependencies();
    const spy = vi.spyOn(dependencies, "transaction");

    await expect(createMedia(actor as never, validInput, dependencies))
      .rejects.toThrow("FORBIDDEN");
    await expect(updateMedia(actor as never, row().id, validInput, dependencies))
      .rejects.toThrow("FORBIDDEN");
    await expect(listMediaForAdmin(actor as never, {list: async () => [], listActive: async () => [], get: async () => null}))
      .rejects.toThrow("FORBIDDEN");
    await expect(getMediaForAdmin(actor as never, row().id, {list: async () => [], listActive: async () => [], get: async () => null}))
      .rejects.toThrow("FORBIDDEN");

    expect(spy).not.toHaveBeenCalled();
    expect(transaction.insertMedia).not.toHaveBeenCalled();
  });

  it("records the registering staff member and audits in the same transaction", async () => {
    const {dependencies, transaction, audits} = mutationDependencies();

    await createMedia(staff, validInput, dependencies);

    expect(transaction.insertMedia).toHaveBeenCalledWith({
      ...validInput, registeredByProfileId: "profile-staff",
    });
    expect(audits).toEqual([expect.objectContaining({action: "media.created"})]);
  });

  it.each([
    ["a remote https host", "https://cdn.example.com/logo.png"],
    ["a protocol-relative host", "//evil.example.com/logo.png"],
    ["a javascript scheme", "javascript:alert(1)"],
    ["a data url", "data:image/png;base64,AAAA"],
    ["a backslash bypass", "/\\evil.example.com/logo.png"],
    ["a tab bypass", `/${String.fromCharCode(9)}/evil.example.com/logo.png`],
    ["an svg", "/images/logo.svg"],
    ["a query string", "/images/logo.png?v=2"],
  ])("rejects %s as a url field error before writing", async (_case, url) => {
    const {dependencies, transaction} = mutationDependencies();

    await expect(createMedia(staff, {...validInput, url}, dependencies))
      .rejects.toMatchObject({issues: [expect.objectContaining({path: ["url"]})]});
    expect(transaction.insertMedia).not.toHaveBeenCalled();
  });

  it("requires alt text in both locales", async () => {
    const {dependencies} = mutationDependencies();

    for (const field of ["altEn", "altZh"]) {
      await expect(createMedia(staff, {...validInput, [field]: "  "}, dependencies))
        .rejects.toMatchObject({issues: [expect.objectContaining({path: [field]})]});
    }
  });

  it("rejects a duplicate url as a url field error", async () => {
    const {dependencies, transaction} = mutationDependencies({
      findByUrl: vi.fn(async () => ({id: "other-media"})),
    });

    await expect(createMedia(staff, validInput, dependencies)).rejects.toMatchObject({
      issues: [expect.objectContaining({path: ["url"], message: "MEDIA_URL_TAKEN"})],
    });
    expect(transaction.insertMedia).not.toHaveBeenCalled();
  });

  it("allows an edit that keeps the same url", async () => {
    const {dependencies, transaction, audits} = mutationDependencies({
      findByUrl: vi.fn(async () => ({id: row().id})),
    });

    await updateMedia(staff, row().id, {url: validInput.url, altEn: "Renamed"}, dependencies);

    expect(transaction.updateMedia).toHaveBeenCalledOnce();
    expect(audits[0]?.metadata).toMatchObject({fields: ["altEn"]});
  });

  it("returns null when the row is missing and writes nothing", async () => {
    const {dependencies, transaction, audits} = mutationDependencies({
      lockMedia: vi.fn(async () => null),
    });

    await expect(updateMedia(staff, row().id, {altEn: "New"}, dependencies)).resolves.toBeNull();
    expect(transaction.updateMedia).not.toHaveBeenCalled();
    expect(audits).toEqual([]);
  });

  it("does not audit a save that changes nothing", async () => {
    const {dependencies, transaction, audits} = mutationDependencies();

    await expect(updateMedia(staff, row().id, {altEn: validInput.altEn}, dependencies))
      .resolves.toMatchObject({id: row().id});
    expect(transaction.updateMedia).not.toHaveBeenCalled();
    expect(audits).toEqual([]);
  });

  it("loads a row by id and tolerates a malformed one without querying", async () => {
    const reads: MediaReadDependencies = {
      list: vi.fn(async () => [row()] as never),
      listActive: vi.fn(async () => [row()] as never),
      get: vi.fn(async () => row() as never),
    };

    await expect(listMediaForAdmin(staff, reads)).resolves.toHaveLength(1);
    // The positive case matters: this is the only loader behind
    // /admin/media/[id], which calls notFound() on a null, so a loader that
    // always returned null would 404 every edit page with a green suite.
    await expect(getMediaForAdmin(staff, row().id, reads)).resolves.toMatchObject({id: row().id});
    expect(reads.get).toHaveBeenCalledExactlyOnceWith(row().id);

    await expect(getMediaForAdmin(staff, "not-a-uuid", reads)).resolves.toBeNull();
    expect(reads.get).toHaveBeenCalledOnce();
  });
});

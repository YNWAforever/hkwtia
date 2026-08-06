import {describe, expect, it, vi} from "vitest";

import {
  createNewsPost,
  getNewsForAdmin,
  listNewsForAdmin,
  updateNewsPost,
  type NewsMutationDependencies,
  type NewsReadDependencies,
} from "@/lib/db/repos/admin-posts";

const staff = {kind: "staff", userId: "user-staff", profileId: "profile-staff"} as const;
const member = {kind: "member", userId: "user-member", profileId: "profile-member"} as const;
const anonymous = {kind: "anonymous", userId: null} as const;

const validInput = {
  slug: "wtia-welcomes-new-members",
  titleEn: "WTIA welcomes new members",
  titleZh: "WTIA 歡迎新會員",
  bodyMdx: "## Welcome\n\nA **warm** welcome.",
  author: "WTIA",
  publishedAt: null,
};

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "news",
    ...validInput,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    sourceKey: null,
    agentRunId: null,
    ...overrides,
  };
}

function mutationDependencies(overrides: Record<string, unknown> = {}) {
  const audits: {action: string; targetId: string}[] = [];
  const transaction = {
    findBySlug: vi.fn(async () => null),
    insertPost: vi.fn(async (input: Record<string, unknown>) => post(input)),
    lockPost: vi.fn(async () => post()),
    updatePost: vi.fn(async (_id: string, input: Record<string, unknown>) => post(input)),
    insertAudit: vi.fn(async (input: {action: string; targetId: string}) => {
      audits.push(input);
    }),
    ...overrides,
  };
  const dependencies: NewsMutationDependencies = {
    transaction: (work) => work(transaction as never),
  };
  return {dependencies, transaction, audits};
}

describe("staff news repository", () => {
  it.each([
    ["member", member],
    ["anonymous", anonymous],
  ])("refuses %s before opening a transaction", async (_name, actor) => {
    const {dependencies, transaction} = mutationDependencies();
    const spy = vi.spyOn(dependencies, "transaction");

    await expect(createNewsPost(actor as never, validInput, dependencies))
      .rejects.toThrow("FORBIDDEN");
    await expect(updateNewsPost(actor as never, post().id, validInput, dependencies))
      .rejects.toThrow("FORBIDDEN");
    await expect(listNewsForAdmin(actor as never, {list: async () => [], get: async () => null}))
      .rejects.toThrow("FORBIDDEN");

    expect(spy).not.toHaveBeenCalled();
    expect(transaction.insertPost).not.toHaveBeenCalled();
  });

  it("writes creation and publication audits in the same transaction", async () => {
    const {dependencies, audits} = mutationDependencies();

    await createNewsPost(staff, {...validInput, publishedAt: new Date("2026-08-02T00:00:00.000Z")}, dependencies);

    expect(audits.map(({action}) => action)).toEqual(["post.created", "post.published"]);
  });

  it("does not log a publication for a draft", async () => {
    const {dependencies, audits} = mutationDependencies();

    await createNewsPost(staff, validInput, dependencies);

    expect(audits.map(({action}) => action)).toEqual(["post.created"]);
  });

  it("rejects a duplicate slug as a slug field error", async () => {
    const {dependencies, transaction} = mutationDependencies({
      findBySlug: vi.fn(async () => ({id: "other-post"})),
    });

    await expect(createNewsPost(staff, validInput, dependencies)).rejects.toMatchObject({
      issues: [expect.objectContaining({path: ["slug"], message: "NEWS_SLUG_TAKEN"})],
    });
    expect(transaction.insertPost).not.toHaveBeenCalled();
  });

  it("requires both locales", async () => {
    const {dependencies} = mutationDependencies();

    await expect(createNewsPost(staff, {...validInput, titleZh: ""}, dependencies))
      .rejects.toMatchObject({issues: [expect.objectContaining({path: ["titleZh"]})]});
  });

  it("returns null when the post is missing and writes nothing", async () => {
    const {dependencies, transaction, audits} = mutationDependencies({
      lockPost: vi.fn(async () => null),
    });

    await expect(updateNewsPost(staff, post().id, {titleEn: "New"}, dependencies))
      .resolves.toBeNull();
    expect(transaction.updatePost).not.toHaveBeenCalled();
    expect(audits).toEqual([]);
  });

  it.each([
    ["publishing", null, new Date("2026-08-02T00:00:00.000Z"), ["post.updated", "post.published"]],
    ["unpublishing", new Date("2026-08-02T00:00:00.000Z"), null, ["post.updated", "post.unpublished"]],
    ["editing only", null, undefined, ["post.updated"]],
  ])("logs %s as a distinct transition", async (_name, before, after, expected) => {
    const {dependencies, audits} = mutationDependencies({
      lockPost: vi.fn(async () => post({publishedAt: before})),
    });

    await updateNewsPost(
      staff,
      post().id,
      after === undefined ? {titleEn: "Edited"} : {publishedAt: after},
      dependencies,
    );

    expect(audits.map(({action}) => action)).toEqual(expected);
  });

  it("reads only news rows and tolerates a malformed id", async () => {
    const reads: NewsReadDependencies = {
      list: vi.fn(async () => [post()] as never),
      get: vi.fn(async () => post() as never),
    };

    await expect(listNewsForAdmin(staff, reads)).resolves.toHaveLength(1);
    await expect(getNewsForAdmin(staff, "not-a-uuid", reads)).resolves.toBeNull();
    expect(reads.get).not.toHaveBeenCalled();
  });
});

import {describe, expect, it, vi} from "vitest";

import {
  createAnnouncement,
  getActiveAnnouncement,
  getAnnouncementForAdmin,
  listAnnouncementsForAdmin,
  setAnnouncementArchived,
  setAnnouncementPublished,
  updateAnnouncement,
  type AnnouncementMutationDependencies,
  type AnnouncementReadDependencies,
} from "@/lib/db/repos/announcements";

const staff = {kind: "staff", userId: "user-staff", profileId: "profile-staff"} as const;
const member = {kind: "member", userId: "user-member", profileId: "profile-member"} as const;
const id = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-08-28T04:00:00.000Z");

const validInput = {
  titleEn: "Applications are open",
  titleZhHk: "現正接受申請",
  ctaLabelEn: "View programme",
  ctaLabelZhHk: "查看計劃",
  href: "/launchpad",
  startsAt: new Date("2026-08-28T00:00:00.000Z"),
  endsAt: new Date("2026-08-29T00:00:00.000Z"),
  priority: 50,
};

function announcement(overrides: Record<string, unknown> = {}) {
  return {
    id,
    ...validInput,
    publishedAt: null,
    archivedAt: null,
    createdAt: new Date("2026-08-27T00:00:00.000Z"),
    updatedAt: new Date("2026-08-27T00:00:00.000Z"),
    ...overrides,
  };
}

function mutationDependencies(overrides: Record<string, unknown> = {}) {
  const audits: Array<{action: string; metadata: Record<string, unknown>}> = [];
  const transaction = {
    insertAnnouncement: vi.fn(async (input: Record<string, unknown>) => announcement(input)),
    lockAnnouncement: vi.fn(async () => announcement()),
    updateAnnouncement: vi.fn(async (_id: string, input: Record<string, unknown>) => announcement(input)),
    setPublishedAt: vi.fn(async (_id: string, value: Date | null) => announcement({publishedAt: value})),
    setArchivedAt: vi.fn(async (_id: string, value: Date | null) => announcement({archivedAt: value})),
    insertAudit: vi.fn(async (input: {action: string; metadata: Record<string, unknown>}) => {
      audits.push(input);
    }),
    ...overrides,
  };
  const dependencies: AnnouncementMutationDependencies = {
    transaction: (work) => work(transaction as never),
  };
  return {dependencies, transaction, audits};
}

describe("staff announcement repository", () => {
  it("authorizes before validation, transactions, or reads", async () => {
    const {dependencies, transaction} = mutationDependencies();
    const transactionSpy = vi.spyOn(dependencies, "transaction");
    const reads: AnnouncementReadDependencies = {
      list: vi.fn(async () => []),
      get: vi.fn(async () => null),
    };

    await expect(createAnnouncement(member, null, dependencies)).rejects.toThrow("FORBIDDEN");
    await expect(updateAnnouncement(member, "bad-id", null, dependencies)).rejects.toThrow("FORBIDDEN");
    await expect(setAnnouncementPublished(member, "bad-id", true, dependencies)).rejects.toThrow("FORBIDDEN");
    await expect(setAnnouncementArchived(member, "bad-id", true, dependencies)).rejects.toThrow("FORBIDDEN");
    await expect(listAnnouncementsForAdmin(member, reads)).rejects.toThrow("FORBIDDEN");
    await expect(getAnnouncementForAdmin(member, "bad-id", reads)).rejects.toThrow("FORBIDDEN");

    expect(transactionSpy).not.toHaveBeenCalled();
    expect(transaction.lockAnnouncement).not.toHaveBeenCalled();
    expect(reads.list).not.toHaveBeenCalled();
    expect(reads.get).not.toHaveBeenCalled();
  });

  it.each([
    ["empty English title", {titleEn: "  "}, "titleEn"],
    ["181-character Chinese title", {titleZhHk: "字".repeat(181)}, "titleZhHk"],
    ["61-character CTA", {ctaLabelEn: "a".repeat(61)}, "ctaLabelEn"],
    ["fractional priority", {priority: 1.5}, "priority"],
    ["negative priority", {priority: -1}, "priority"],
    ["priority above 1000", {priority: 1001}, "priority"],
    ["external URL", {href: "https://example.test/events"}, "href"],
    ["protocol-relative URL", {href: "//example.test/events"}, "href"],
    ["query string", {href: "/events?draft=1"}, "href"],
    ["fragment", {href: "/events#top"}, "href"],
    ["traversal", {href: "/events/../admin"}, "href"],
  ])("rejects %s before insertion", async (_name, override, field) => {
    const {dependencies, transaction} = mutationDependencies();
    await expect(createAnnouncement(staff, {...validInput, ...override}, dependencies))
      .rejects.toMatchObject({issues: [expect.objectContaining({path: [field]})]});
    expect(transaction.insertAnnouncement).not.toHaveBeenCalled();
  });

  it("trims localized copy, accepts exact bounds, and audits creation in the transaction", async () => {
    const {dependencies, transaction, audits} = mutationDependencies();
    const created = await createAnnouncement(staff, {
      ...validInput,
      titleEn: ` ${"a".repeat(180)} `,
      ctaLabelEn: ` ${"b".repeat(60)} `,
      priority: 1000,
    }, dependencies);

    expect(transaction.insertAnnouncement).toHaveBeenCalledWith(expect.objectContaining({
      titleEn: "a".repeat(180),
      ctaLabelEn: "b".repeat(60),
      priority: 1000,
    }));
    expect(created.titleEn).toHaveLength(180);
    expect(audits.map(({action}) => action)).toEqual(["announcement.created"]);
  });

  it("counts Unicode code points consistently with PostgreSQL char_length", async () => {
    const accepted = mutationDependencies();
    await expect(createAnnouncement(staff, {
      ...validInput,
      titleEn: "😀".repeat(180),
      ctaLabelEn: "🚀".repeat(60),
    }, accepted.dependencies)).resolves.toBeTruthy();

    const rejected = mutationDependencies();
    await expect(createAnnouncement(staff, {
      ...validInput,
      titleEn: "😀".repeat(181),
    }, rejected.dependencies)).rejects.toMatchObject({
      issues: [expect.objectContaining({path: ["titleEn"]})],
    });
    expect(rejected.transaction.insertAnnouncement).not.toHaveBeenCalled();
  });

  it("rejects empty and reversed windows on create and partial update", async () => {
    const {dependencies, transaction} = mutationDependencies();
    await expect(createAnnouncement(staff, {
      ...validInput, endsAt: validInput.startsAt,
    }, dependencies)).rejects.toMatchObject({
      issues: [expect.objectContaining({path: ["endsAt"]})],
    });

    await expect(updateAnnouncement(staff, id, {
      startsAt: new Date("2026-08-30T00:00:00.000Z"),
    }, dependencies)).rejects.toMatchObject({
      issues: [expect.objectContaining({path: ["endsAt"]})],
    });
    expect(transaction.updateAnnouncement).not.toHaveBeenCalled();
  });

  it("locks before update and records only changed fields", async () => {
    const {dependencies, transaction, audits} = mutationDependencies();
    await updateAnnouncement(staff, id, {titleEn: "Updated title"}, dependencies);

    expect(transaction.lockAnnouncement).toHaveBeenCalledWith(id);
    expect(transaction.updateAnnouncement).toHaveBeenCalledWith(id, {titleEn: "Updated title"});
    expect(audits).toEqual([expect.objectContaining({
      action: "announcement.updated",
      metadata: {fields: ["titleEn"]},
    })]);
    expect(transaction.lockAnnouncement.mock.invocationCallOrder[0])
      .toBeLessThan(transaction.updateAnnouncement.mock.invocationCallOrder[0]!);
  });

  it.each([
    ["publish", true, null, "announcement.published"],
    ["unpublish", false, new Date("2026-08-27T10:00:00.000Z"), "announcement.unpublished"],
  ])("locks and audits %s as an explicit transition", async (_name, publish, before, action) => {
    const {dependencies, transaction, audits} = mutationDependencies({
      lockAnnouncement: vi.fn(async () => announcement({publishedAt: before})),
    });
    await setAnnouncementPublished(staff, id, publish as boolean, dependencies, () => now);
    expect(transaction.setPublishedAt).toHaveBeenCalledWith(id, publish ? now : null);
    expect(audits.map(({action: value}) => value)).toEqual([action]);
  });

  it.each([
    ["archive", true, null, "announcement.archived"],
    ["restore", false, now, "announcement.unarchived"],
  ])("locks and audits %s as an explicit transition", async (_name, archive, before, action) => {
    const {dependencies, transaction, audits} = mutationDependencies({
      lockAnnouncement: vi.fn(async () => announcement({archivedAt: before})),
    });
    await setAnnouncementArchived(staff, id, archive as boolean, dependencies, () => now);
    expect(transaction.setArchivedAt).toHaveBeenCalledWith(id, archive ? now : null);
    expect(audits.map(({action: value}) => value)).toEqual([action]);
  });

  it("treats repeated lifecycle requests as no-ops", async () => {
    const {dependencies, transaction, audits} = mutationDependencies({
      lockAnnouncement: vi.fn(async () => announcement({publishedAt: now, archivedAt: now})),
    });
    await setAnnouncementPublished(staff, id, true, dependencies, () => now);
    await setAnnouncementArchived(staff, id, true, dependencies, () => now);
    expect(transaction.setPublishedAt).not.toHaveBeenCalled();
    expect(transaction.setArchivedAt).not.toHaveBeenCalled();
    expect(audits).toEqual([]);
  });

  it("caps the admin list at 100 and tolerates a malformed detail id after auth", async () => {
    const reads: AnnouncementReadDependencies = {
      list: vi.fn(async () => [announcement()] as never),
      get: vi.fn(async () => announcement() as never),
    };
    await expect(listAnnouncementsForAdmin(staff, reads)).resolves.toHaveLength(1);
    expect(reads.list).toHaveBeenCalledWith(100);
    await expect(getAnnouncementForAdmin(staff, "bad-id", reads)).resolves.toBeNull();
    expect(reads.get).not.toHaveBeenCalled();
  });
});

describe("future active announcement projection", () => {
  it("uses published inclusive start/exclusive end state and deterministic ordering", async () => {
    const rows = [
      announcement({id: "00000000-0000-4000-8000-000000000003", publishedAt: now, priority: 80}),
      announcement({id: "00000000-0000-4000-8000-000000000002", publishedAt: now, priority: 90}),
      announcement({id: "00000000-0000-4000-8000-000000000001", publishedAt: now, priority: 90}),
      announcement({id: "00000000-0000-4000-8000-000000000000", publishedAt: now, priority: 100, archivedAt: now}),
      announcement({id: "00000000-0000-4000-8000-000000000004", publishedAt: null, priority: 100}),
      announcement({id: "00000000-0000-4000-8000-000000000005", publishedAt: now, priority: 100, startsAt: now}),
    ];

    await expect(getActiveAnnouncement(now, rows as never)).resolves.toMatchObject({
      id: "00000000-0000-4000-8000-000000000005",
      priority: 100,
    });
    await expect(getActiveAnnouncement(
      new Date("2026-08-29T00:00:00.000Z"), rows as never,
    )).resolves.toBeNull();
  });

  it("orders equal priority by latest start then id ascending", async () => {
    const rows = [
      announcement({id: "00000000-0000-4000-8000-000000000002", publishedAt: now, startsAt: new Date("2026-08-28T01:00:00.000Z"), priority: 10}),
      announcement({id: "00000000-0000-4000-8000-000000000001", publishedAt: now, startsAt: new Date("2026-08-28T01:00:00.000Z"), priority: 10}),
      announcement({id: "00000000-0000-4000-8000-000000000000", publishedAt: now, startsAt: new Date("2026-08-28T00:00:00.000Z"), priority: 10}),
    ];
    await expect(getActiveAnnouncement(now, rows as never)).resolves.toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
    });
  });
});

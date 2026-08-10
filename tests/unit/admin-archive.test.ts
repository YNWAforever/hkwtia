import {describe, expect, it, vi} from "vitest";

import {setNewsArchived} from "@/lib/db/repos/admin-posts";
import {setMediaArchived} from "@/lib/db/repos/media";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

const staff: AdminActor = {kind: "staff", userId: "auth-staff", profileId: "profile-staff"};
const member: Actor = {kind: "member", userId: "auth-member", profileId: "profile-member"};
const id = "11111111-1111-4111-8111-111111111111";
const at = new Date("2026-08-10T00:00:00.000Z");

function newsTransaction(archivedAt: Date | null) {
  const audits: {action: string}[] = [];
  const current = {id, slug: "a-post", kind: "news", archivedAt} as never;
  const transaction = {
    findBySlug: vi.fn(async () => null),
    insertPost: vi.fn(),
    lockPost: vi.fn(async () => current),
    updatePost: vi.fn(),
    setArchivedAt: vi.fn(async (_id: string, next: Date | null) =>
      ({...(current as object), archivedAt: next}) as never),
    insertAudit: vi.fn(async (input: {action: string}) => { audits.push({action: input.action}); }),
  };
  return {dependencies: {transaction: (work: never) => (work as never as (t: unknown) => unknown)(transaction)} as never, transaction, audits};
}

function mediaTransaction(archivedAt: Date | null, listingReferences = 0) {
  const audits: {action: string}[] = [];
  const current = {id, url: "/images/a.png", archivedAt} as never;
  const transaction = {
    findByUrl: vi.fn(async () => null),
    insertMedia: vi.fn(),
    lockMedia: vi.fn(async () => current),
    updateMedia: vi.fn(),
    countListingReferences: vi.fn(async () => listingReferences),
    setArchivedAt: vi.fn(async (_id: string, next: Date | null) =>
      ({...(current as object), archivedAt: next}) as never),
    insertAudit: vi.fn(async (input: {action: string}) => { audits.push({action: input.action}); }),
  };
  return {dependencies: {transaction: (work: never) => (work as never as (t: unknown) => unknown)(transaction)} as never, transaction, audits};
}

describe("news archiving", () => {
  it("archives a post and records who did it", async () => {
    const {dependencies, transaction, audits} = newsTransaction(null);

    const post = await setNewsArchived(staff, id, true, dependencies, () => at);

    expect(post?.archivedAt).toEqual(at);
    expect(transaction.setArchivedAt).toHaveBeenCalledWith(id, at);
    expect(audits).toEqual([{action: "post.archived"}]);
  });

  it("restores a post", async () => {
    const {dependencies, transaction, audits} = newsTransaction(at);

    await setNewsArchived(staff, id, false, dependencies, () => at);

    expect(transaction.setArchivedAt).toHaveBeenCalledWith(id, null);
    expect(audits).toEqual([{action: "post.unarchived"}]);
  });

  // A save that changes nothing is not an event worth recording.
  it("is a no-op when the post is already in the requested state", async () => {
    const {dependencies, transaction, audits} = newsTransaction(at);

    await setNewsArchived(staff, id, true, dependencies, () => at);

    expect(transaction.setArchivedAt).not.toHaveBeenCalled();
    expect(audits).toEqual([]);
  });

  it("refuses a non-admin before reading the row", async () => {
    const {dependencies, transaction} = newsTransaction(null);

    await expect(setNewsArchived(member, id, true, dependencies)).rejects.toThrow("FORBIDDEN");
    expect(transaction.lockPost).not.toHaveBeenCalled();
  });
});

describe("media archiving", () => {
  it("archives an unreferenced entry", async () => {
    const {dependencies, audits} = mediaTransaction(null, 0);

    const entry = await setMediaArchived(staff, id, true, dependencies, () => at);

    expect(entry?.archivedAt).toEqual(at);
    expect(audits).toEqual([{action: "media.archived"}]);
  });

  // Archiving does not clear showcase_listings.logo_media_id, so allowing it
  // while a listing still points at the image would blank that listing's logo
  // without anyone asking for it.
  it("refuses to archive an image a listing still uses", async () => {
    const {dependencies, transaction, audits} = mediaTransaction(null, 2);

    await expect(setMediaArchived(staff, id, true, dependencies, () => at))
      .rejects.toThrow(/MEDIA_IN_USE/);
    expect(transaction.setArchivedAt).not.toHaveBeenCalled();
    expect(audits).toEqual([]);
  });

  it("restores a referenced image without complaint", async () => {
    const {dependencies, transaction, audits} = mediaTransaction(at, 2);

    await setMediaArchived(staff, id, false, dependencies, () => at);

    expect(transaction.setArchivedAt).toHaveBeenCalledWith(id, null);
    expect(audits).toEqual([{action: "media.unarchived"}]);
  });

  it("refuses a non-admin before reading the row", async () => {
    const {dependencies, transaction} = mediaTransaction(null, 0);

    await expect(setMediaArchived(member, id, true, dependencies)).rejects.toThrow("FORBIDDEN");
    expect(transaction.lockMedia).not.toHaveBeenCalled();
  });
});

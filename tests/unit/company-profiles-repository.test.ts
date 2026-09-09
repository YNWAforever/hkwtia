import {describe, expect, it, vi} from "vitest";

import {createCompanyProfilesRepository} from "@/lib/db/repos/company-profiles";
import type {Actor, CompanyRole} from "@/lib/membership/lifecycle";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const LOGO = "33333333-3333-4333-8333-333333333333";
const member: Actor = {kind: "member", userId: "u", profileId: "m1"};
const staff: Actor = {kind: "staff", userId: "s", profileId: "s1"};
const roles = async (actor: Actor): Promise<CompanyRole | null> =>
  ("profileId" in actor && actor.profileId === "m1" ? "owner" : null);

/** Each queue entry is what the next `execute` returns, or an Error it rejects with. */
function db(rows: (Record<string, unknown>[] | Error)[]) {
  const queue = [...rows];
  const execute = vi.fn<(query: unknown) => Promise<Record<string, unknown>[]>>(async () => {
    const next = queue.shift() ?? [];
    if (next instanceof Error) throw next;
    return next;
  });
  const database = {execute, transaction: async <T,>(work: (tx: {execute: typeof execute}) => Promise<T>) => work({execute})};
  return {execute, load: async () => database as never};
}

/** The literal SQL text of a drizzle `sql` object: its string chunks, nested templates included, without parameters or identifiers. */
function literalText(chunk: unknown): string {
  if (!chunk || typeof chunk !== "object") return "";
  if ("queryChunks" in chunk && Array.isArray(chunk.queryChunks)) return chunk.queryChunks.map(literalText).join("");
  if ("value" in chunk && Array.isArray(chunk.value)) return chunk.value.join("");
  return "";
}

function statementText(execute: ReturnType<typeof db>["execute"], call: number): string {
  return literalText(execute.mock.calls[call]?.[0]);
}

const profile = {
  slug: "acme",
  taglineEn: "Ships things",
  taglineZhHk: "運送",
  descriptionZhHk: null,
  tags: ["ai", "logistics"],
  logoMediaId: null,
  website: "https://acme.example",
};

const directoryRow = {
  id: COMPANY, slug: "acme", display_name: "Acme", tagline_en: "x", tagline_zh_hk: "y",
  tags: ["ai"], website: null, plan_code: "corporate", logo_url: null,
};

function uniqueViolation(wrapped: boolean): Error {
  const driver = Object.assign(new Error("duplicate key value violates unique constraint companies_slug_unique"), {
    code: "23505",
    constraint: "companies_slug_unique",
  });
  return wrapped ? Object.assign(new Error("Failed query"), {cause: driver}) : driver;
}

describe("companyProfilesRepository (programme B-6, B-7)", () => {
  it("public reads need no actor and only see published profiles", async () => {
    const {execute, load} = db([[directoryRow]]);
    const repository = createCompanyProfilesRepository({loadDatabase: load, getCompanyRole: roles});

    const rows = await repository.listPublished({q: null, tag: null, plan: null});

    expect(rows[0]).toMatchObject({slug: "acme", name: "Acme", plan: "corporate"});
    expect(execute).toHaveBeenCalledTimes(1);
    // The scope is a predicate, never a JS filter: a row that is not published
    // must not reach this process at all.
    const statement = statementText(execute, 0);
    expect(statement).toContain("= 'published'");
    expect(statement).toContain("IS NOT NULL");
  });

  it("drops a filter it cannot validate instead of passing it to SQL", async () => {
    const {execute, load} = db([[directoryRow], [directoryRow]]);
    const repository = createCompanyProfilesRepository({loadDatabase: load, getCompanyRole: roles});

    await repository.listPublished({q: "a".repeat(200), tag: "crypto-scams", plan: "platinum" as never});
    expect(statementText(execute, 0)).not.toContain("ILIKE");
    expect(statementText(execute, 0)).not.toContain("@>");

    await repository.listPublished({q: "acme", tag: "ai", plan: "patron"});
    expect(statementText(execute, 1)).toContain("ILIKE");
    expect(statementText(execute, 1)).toContain("@>");
  });

  it("reads one published profile with its showcase listing and upcoming events", async () => {
    const {execute, load} = db([
      [{...directoryRow, description: "About Acme", description_zh_hk: null, industry: "logistics", size_band: "11-50"}],
      [{slug: "acme-listing", name_en: "Acme"}],
      [{slug: "ai-clinic", title_en: "AI Clinic", title_zh: null, starts_at: new Date("2030-03-01T02:00:00Z")}],
    ]);
    const repository = createCompanyProfilesRepository({loadDatabase: load, getCompanyRole: roles});

    await expect(repository.getPublishedBySlug("acme")).resolves.toMatchObject({
      slug: "acme",
      name: "Acme",
      showcase: {slug: "acme-listing", name: "Acme"},
      events: [{slug: "ai-clinic", titleEn: "AI Clinic"}],
    });
    expect(execute).toHaveBeenCalledTimes(3);
    expect(statementText(execute, 0)).toContain("= 'published'");
  });

  it("rejects a slug the route could never have minted before opening the database", async () => {
    const {execute, load} = db([]);
    const repository = createCompanyProfilesRepository({loadDatabase: load, getCompanyRole: roles});

    await expect(repository.getPublishedBySlug("Acme Ltd.")).resolves.toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  it("member updates require a manager role and reject unknown tags before any SQL", async () => {
    const {execute, load} = db([[{id: COMPANY, public_profile_status: "hidden"}]]);
    const repository = createCompanyProfilesRepository({loadDatabase: load, getCompanyRole: roles});

    await expect(repository.updateProfile({...member, profileId: "m2"} as Actor, COMPANY, profile)).rejects.toThrow("FORBIDDEN");
    await expect(repository.updateProfile(member, COMPANY, {...profile, tags: ["nope"]})).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
    await expect(repository.updateProfile(member, COMPANY, profile)).resolves.toMatchObject({id: COMPANY});
    // A published profile re-enters review on every owner edit, and the
    // reviewer columns reset, so a stale approval never covers new copy.
    expect(statementText(execute, 0)).toContain("pending_review");
  });

  it("maps the slug unique violation to COMPANY_SLUG_TAKEN, wrapped or raw", async () => {
    for (const wrapped of [false, true]) {
      const {load} = db([uniqueViolation(wrapped)]);
      const repository = createCompanyProfilesRepository({loadDatabase: load, getCompanyRole: roles});
      await expect(repository.updateProfile(member, COMPANY, profile)).rejects.toThrow("COMPANY_SLUG_TAKEN");
    }
  });

  it("refuses a logo the member does not own before writing the row", async () => {
    const {execute, load} = db([[{id: COMPANY, public_profile_status: "hidden"}]]);
    const getOwnedMedia = vi.fn(async () => null);
    const repository = createCompanyProfilesRepository({loadDatabase: load, getCompanyRole: roles, getOwnedMedia});

    await expect(repository.updateProfile(member, COMPANY, {...profile, logoMediaId: LOGO}))
      .rejects.toThrow("COMPANY_LOGO_INVALID");
    expect(getOwnedMedia).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it("submit moves hidden to pending_review; review publishes with an audit row in the same transaction", async () => {
    const pending = {id: COMPANY, public_profile_status: "pending_review", slug: "acme"};
    const {execute, load} = db([[pending], [pending], [{...pending, public_profile_status: "published"}], []]);
    const repository = createCompanyProfilesRepository({loadDatabase: load, getCompanyRole: roles});

    await expect(repository.submitForReview(member, COMPANY)).resolves.toMatchObject({public_profile_status: "pending_review"});
    await expect(repository.review(staff, COMPANY, {decision: "approve"})).resolves.toMatchObject({public_profile_status: "published"});
    expect(execute).toHaveBeenCalledTimes(4);
    // `literalText` drops interpolated identifiers, so the audit table itself
    // is invisible here; its column list is what pins the statement.
    expect(statementText(execute, 3)).toContain("INSERT INTO");
    expect(statementText(execute, 3)).toContain("actor_user_id, actor_type, action, target_type, target_id, metadata");
    await expect(repository.review(member, COMPANY, {decision: "approve"})).rejects.toThrow();
  });

  it("refuses to publish a profile with no slug, which companies_public_profile_slug_check would reject", async () => {
    const {execute, load} = db([[{id: COMPANY, public_profile_status: "pending_review", slug: null}]]);
    const repository = createCompanyProfilesRepository({loadDatabase: load, getCompanyRole: roles});

    await expect(repository.review(staff, COMPANY, {decision: "approve"})).rejects.toThrow("COMPANY_SLUG_REQUIRED");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("refuses a review of a profile that is not awaiting one", async () => {
    const {load} = db([[{id: COMPANY, public_profile_status: "hidden", slug: "acme"}]]);
    const repository = createCompanyProfilesRepository({loadDatabase: load, getCompanyRole: roles});

    await expect(repository.review(staff, COMPANY, {decision: "approve"})).rejects.toThrow("INVALID_PROFILE_TRANSITION");
  });

  it("keeps the review queue and the sitemap slug list behind their own gates", async () => {
    const queue = [{id: COMPANY, public_profile_status: "pending_review", slug: "acme", display_name: "Acme", logo_url: null}];
    const {execute, load} = db([queue, [{slug: "acme"}]]);
    const repository = createCompanyProfilesRepository({loadDatabase: load, getCompanyRole: roles});

    await expect(repository.listForReview(member)).rejects.toThrow("FORBIDDEN");
    await expect(repository.listForReview(staff)).resolves.toMatchObject([{display_name: "Acme"}]);
    await expect(repository.listPublishedSlugs()).resolves.toEqual(["acme"]);
    expect(statementText(execute, 1)).toContain("= 'published'");
  });
});

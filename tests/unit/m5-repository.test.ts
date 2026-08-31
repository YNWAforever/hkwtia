import {describe, expect, it} from "vitest";

import type {ShowcaseListing} from "@/lib/db/server-schema";
import type {AdminActor} from "@/lib/membership/lifecycle";
import {
  createShowcaseRepository,
  type ShowcaseStore,
} from "@/lib/db/repos/showcase";
import {actorFor} from "@/tests/helpers/fakes";

function listing(overrides: Partial<ShowcaseListing> = {}): ShowcaseListing {
  return {
    id: "listing-1",
    companyId: "company-1",
    slug: "harbour-vision-ai",
    status: "draft",
    premium: false,
    views: 0,
    memberSince: "2020-01-01",
    nameEn: "Harbour Vision AI",
    nameZhHk: "港灣視野 AI",
    taglineEn: "Trade intelligence",
    taglineZhHk: "貿易智能",
    descriptionEn: "Public description",
    descriptionZhHk: "公開描述",
    category: "software",
    useCases: ["logistics"],
    deploymentOptions: ["cloud"],
    supportedLanguages: ["en", "zh-HK"],
    worksWith: ["ERP"],
    videoUrl: null,
    caseStudyUrl: null,
    caseStudySummaryEn: null,
    caseStudySummaryZhHk: null,
    logoReference: null,
    reviewedAt: null,
    reviewedByProfileId: null,
    rejectionReason: null,
    createdAt: new Date("2020-01-01T00:00:00.000Z"),
    updatedAt: new Date("2020-01-01T00:00:00.000Z"),
    ...overrides,
  } as ShowcaseListing;
}

function memoryStore(initial: ShowcaseListing[]): ShowcaseStore & {viewWrites: number; listPublishedOptions: readonly unknown[]} {
  const rows = [...initial];
  const state: {viewWrites: number; listPublishedOptions: unknown[]} = {viewWrites: 0, listPublishedOptions: []};
  return {
    getByCompany: async (companyId) => rows.find((row) => row.companyId === companyId) ?? null,
    getById: async (id) => rows.find((row) => row.id === id) ?? null,
    upsert: async (companyId, input, status) => {
      const current = rows.find((row) => row.companyId === companyId);
      const next = listing({
        ...(current ?? {}),
        ...(input as unknown as Partial<ShowcaseListing>),
        companyId,
        status,
        id: current?.id ?? "listing-created",
      });
      if (current) rows[rows.indexOf(current)] = next;
      else rows.push(next);
      return next;
    },
    listForReview: async () => rows,
    setStatus: async (id, status, reviewerId, reason) => {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row) return null;
      Object.assign(row, {status, reviewedByProfileId: reviewerId, reviewedAt: new Date("2030-01-01T00:00:00.000Z"), rejectionReason: reason ?? null});
      return row;
    },
    setPremium: async (id, premium) => {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row) return null;
      row.premium = premium;
      return row;
    },
    setLogoMedia: async (id, mediaId) => {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row) return null;
      row.logoMediaId = mediaId;
      return row;
    },
    listPublished: async (_filters, options?: unknown) => {
      state.listPublishedOptions.push(options);
      return rows;
    },
    getPublishedBySlug: async (slug) => rows.find((row) => row.slug === slug) ?? null,
    listPublishedSlugs: async () => rows.filter((row) => row.status === "published").map((row) => row.slug),
    incrementViews: async (slug) => {
      const row = rows.find((candidate) => candidate.slug === slug && candidate.status === "published");
      if (row) {
        row.views += 1;
        state.viewWrites += 1;
      }
    },
    insertLead: async () => null,
    get viewWrites() {
      return state.viewWrites;
    },
    get listPublishedOptions() {
      return state.listPublishedOptions;
    },
  };
}

describe("showcase repository", () => {
  it("rejects a member without owner/admin role before writing", async () => {
    const store = memoryStore([listing()]);
    const repo = createShowcaseRepository({
      store,
      getCompanyRole: async () => "member",
    });

    await expect(repo.upsertDraft(actorFor("member"), "company-1", {
      slug: "harbour-vision-ai",
      nameEn: "Changed",
      nameZhHk: "變更",
      taglineEn: "tagline",
      taglineZhHk: "標語",
      descriptionEn: "description",
      descriptionZhHk: "描述",
      category: "software",
      useCases: ["logistics"],
      deploymentOptions: ["cloud"],
      supportedLanguages: ["en"],
      worksWith: ["ERP"],
      videoUrl: null,
      caseStudyUrl: null,
      caseStudySummaryEn: null,
      caseStudySummaryZhHk: null,
      logoReference: null,
    }, "draft")).rejects.toThrow("FORBIDDEN");
  });

  it("publishes with reviewer attribution and rejects with a reason", async () => {
    const store = memoryStore([
      listing({id: "pending-1", slug: "pending-one", status: "pending_review"}),
      listing({id: "pending-2", slug: "pending-two", status: "pending_review"}),
    ]);
    const repo = createShowcaseRepository({store});
    const staff = {kind: "staff", userId: "staff", profileId: "staff"} as AdminActor;

    const published = await repo.publish(staff, "pending-1");
    expect(published?.status).toBe("published");
    expect(published?.reviewedByProfileId).toBe(staff.profileId);

    const rejected = await repo.reject(staff, "pending-2", "Needs clearer case study");
    expect(rejected?.status).toBe("rejected");
    expect(rejected?.rejectionReason).toBe("Needs clearer case study");
  });

  it("returns only published rows and keeps deterministic premium ordering", async () => {
    const store = memoryStore([
      listing({id: "free", slug: "free", status: "published", premium: false}),
      listing({id: "premium", slug: "premium", status: "published", premium: true}),
      listing({id: "draft", slug: "draft", status: "draft", premium: true}),
    ]);
    const repo = createShowcaseRepository({store});
    const rows = await repo.listPublished({category: "software"});
    expect(rows.map((row) => row.slug)).toEqual(["premium", "free"]);
  });

  it("bounds the deterministic published order", async () => {
    const store = memoryStore([
      listing({id: "free", slug: "free", status: "published", premium: false}),
      listing({id: "z", slug: "z", status: "published", premium: true, nameEn: "Zulu"}),
      listing({id: "a", slug: "a", status: "published", premium: true, nameEn: "Alpha"}),
    ]);
    const repo = createShowcaseRepository({store});

    await expect(repo.listPublished({}, {limit: 2}))
      .resolves.toMatchObject([{slug: "a"}, {slug: "z"}]);
    expect(store.listPublishedOptions).toEqual([{limit: 2}]);
  });

  it.each([0, 13, 1.5])("rejects invalid showcase limit %s before reading the store", async (limit) => {
    const store = memoryStore([listing({status: "published"})]);
    const repo = createShowcaseRepository({store});

    await expect(repo.listPublished({}, {limit})).rejects.toThrow();
    expect(store.listPublishedOptions).toEqual([]);
  });

  it("uses the repository view seam for an atomic increment", async () => {
    const store = memoryStore([listing({status: "published"})]);
    const repo = createShowcaseRepository({store});
    await repo.recordView("harbour-vision-ai");
    expect(store.viewWrites).toBe(1);
  });
});

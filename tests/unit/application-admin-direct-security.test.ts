import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

type Identity = Readonly<{
  profileId: string;
  role: "member" | "staff";
}>;

type SessionFixture = Readonly<{
  authUserId: string;
  identity: Identity;
}>;

type DenialScenario = Readonly<{
  label: string;
  session: SessionFixture | null;
  targetId: string;
  denial: "FORBIDDEN" | "UNAUTHORIZED";
}>;

const state = vi.hoisted(() => ({
  identities: {} as Record<string, {profileId: string; role: "member" | "staff"}>,
  getSession: vi.fn(),
  resolveIdentity: vi.fn(),
  touchLastLogin: vi.fn(),
  updateCase: vi.fn(),
  getReceipt: vi.fn(),
  prepareDraft: vi.fn(),
  adoptDraft: vi.fn(),
  getTriage: vi.fn(),
  getCase: vi.fn(),
  getQueue: vi.fn(),
  listOwners: vi.fn(),
  getDraft: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
  revalidatePath: vi.fn(),
  getTranslations: vi.fn(),
  setRequestLocale: vi.fn(),
  getLocale: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({getSession: state.getSession}));
vi.mock("@/lib/db/repos/profile-identities", () => ({
  profileIdentityRepository: {
    resolve: state.resolveIdentity,
    touchLastLogin: state.touchLastLogin,
  },
}));
vi.mock("@/lib/admin/application-case-service", () => ({
  updateApplicationCase: state.updateCase,
  getApplicationCaseSaveResult: state.getReceipt,
  adoptApplicationDraft: state.adoptDraft,
  getApplicationTriage: state.getTriage,
}));
vi.mock("@/lib/ai/application-triage", () => ({
  prepareApplicationDraft: state.prepareDraft,
}));
vi.mock("@/lib/db/repos/applications", () => ({
  applicationsRepository: {
    getApplicationCase: state.getCase,
    getApplicationTriage: state.getTriage,
  },
}));
vi.mock("@/lib/db/repos/admin-members", async (original) => ({
  ...(await original<typeof import("@/lib/db/repos/admin-members")>()),
  adminMembersRepository: {
    getApplicationQueuePage: state.getQueue,
    listOperationOwners: state.listOwners,
  },
}));
vi.mock("@/lib/db/repos/ai-drafts", () => ({
  aiDraftsRepository: {getDraft: state.getDraft},
}));
vi.mock("@/components/admin/application-queue-table", () => ({
  ApplicationQueueTable: () => null,
}));
vi.mock("@/components/admin/application-case-form", () => ({
  ApplicationCaseForm: () => null,
}));
vi.mock("@/components/admin/ai-review-panel", () => ({
  AiReviewPanel: () => null,
}));
vi.mock("@/components/admin/application-draft-adopt", () => ({
  ApplicationDraftAdopt: () => null,
}));
vi.mock("@/components/internal-shell/private-link", () => ({
  PrivateLink: () => null,
}));
vi.mock("next/cache", () => ({revalidatePath: state.revalidatePath}));
vi.mock("next/navigation", () => ({
  redirect: state.redirect,
  notFound: state.notFound,
}));
vi.mock("next-intl/server", () => ({
  getLocale: state.getLocale,
  getTranslations: state.getTranslations,
  setRequestLocale: state.setRequestLocale,
}));

const MEMBER_A_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_B_ID = "22222222-2222-4222-8222-222222222222";
const STAFF_PROFILE_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "44444444-4444-4444-8444-444444444444";
const DRAFT_ID = "55555555-5555-4555-8555-555555555555";
const CASE_VERSION = "66666666-6666-4666-8666-666666666666";

const memberA: SessionFixture = {
  authUserId: "synthetic-auth-member-a",
  identity: {profileId: MEMBER_A_ID, role: "member"},
};
const memberB: SessionFixture = {
  authUserId: "synthetic-auth-member-b",
  identity: {profileId: MEMBER_B_ID, role: "member"},
};
const staff: SessionFixture = {
  authUserId: "synthetic-auth-staff",
  identity: {profileId: STAFF_PROFILE_ID, role: "staff"},
};
const expectedStaffActor = {
  kind: "staff",
  userId: staff.authUserId,
  profileId: STAFF_PROFILE_ID,
} as const;

const denials: readonly DenialScenario[] = [
  {
    label: "member A using its own ID",
    session: memberA,
    targetId: MEMBER_A_ID,
    denial: "FORBIDDEN",
  },
  {
    label: "member B using its own ID",
    session: memberB,
    targetId: MEMBER_B_ID,
    denial: "FORBIDDEN",
  },
  {
    label: "member A targeting member B",
    session: memberA,
    targetId: MEMBER_B_ID,
    denial: "FORBIDDEN",
  },
  {
    label: "a logged-out request",
    session: null,
    targetId: MEMBER_A_ID,
    denial: "UNAUTHORIZED",
  },
];

const caseRecord = {
  profile: {
    email: null,
    phone: null,
    jobTitle: null,
    locale: "en",
    onboardingState: "active",
  },
  company: null,
  application: {
    id: MEMBER_A_ID,
    profileId: MEMBER_A_ID,
    name: "Synthetic Applicant",
    companyId: null,
    companyName: null,
    planCode: "startup",
    status: "draft",
    step: "review",
    createdAt: "2026-10-01T01:00:00.000Z",
    updatedAt: "2026-10-02T01:00:00.000Z",
  },
  membership: null,
  payment: null,
  version: "0",
  ownerProfileId: null,
  dueAt: null,
  missingFields: [],
  nextActionCode: "none",
  timeline: [],
} as const;

function signIn(session: SessionFixture | null): void {
  if (!session) {
    state.getSession.mockResolvedValue(null);
    return;
  }
  state.identities[session.authUserId] = session.identity;
  state.getSession.mockResolvedValue({user: {id: session.authUserId}} as never);
}

function caseForm(): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    expectedVersion: "0",
    requestId: REQUEST_ID,
    ownerProfileId: "",
    dueAt: "2026-10-02T14:30",
    nextActionCode: "await_documents",
    note: "Synthetic security test note",
  })) {
    form.set(key, value);
  }
  return form;
}

function adoptionInput() {
  return {
    draftId: DRAFT_ID,
    expectedVersion: 1,
    expectedCaseVersion: "0",
  } as const;
}

function adminLoginPath(next?: string): string {
  return next
    ? "/admin-login?" + new URLSearchParams({next}).toString()
    : "/admin-login";
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
    return new Error(String(error));
  }
  throw new Error("EXPECTED_REJECTION");
}

async function loadActions() {
  return {
    ...(await import("@/lib/admin/application-case-actions")),
    ...(await import("@/lib/admin/application-draft-actions")),
  };
}

async function loadQueuePages() {
  return {
    list: (await import("@/app/[locale]/(admin)/admin/members/queue/page")).default,
    detail: (await import("@/app/[locale]/(admin)/admin/members/queue/[id]/page")).default,
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.identities = {};
  state.getSession.mockResolvedValue(null);
  state.resolveIdentity.mockImplementation(async (authUserId: string) => (
    state.identities[authUserId] ?? null
  ));
  state.touchLastLogin.mockResolvedValue(undefined);
  state.updateCase.mockResolvedValue({version: CASE_VERSION});
  state.getReceipt.mockResolvedValue({version: CASE_VERSION});
  state.prepareDraft.mockResolvedValue({id: DRAFT_ID, state: "needs_review"});
  state.adoptDraft.mockResolvedValue({status: "adopted"});
  state.getTriage.mockResolvedValue(null);
  state.getCase.mockResolvedValue(caseRecord);
  state.getQueue.mockResolvedValue({
    items: [],
    nextCursor: null,
    totalMatching: 0,
    counts: {draft: 0, pending_payment: 0, pending_review: 0},
  });
  state.listOwners.mockResolvedValue([]);
  state.getDraft.mockResolvedValue(null);
  state.redirect.mockImplementation((path: string) => {
    throw new Error("NEXT_REDIRECT:" + path);
  });
  state.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
  state.getTranslations.mockImplementation(async () => Object.assign(
    (key: string) => key,
    {raw: (key: string) => key, has: () => true},
  ));
  state.getLocale.mockResolvedValue("en");
  vi.stubEnv("ADMIN_AI_DRAFTS_ENABLED", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("direct application admin action security", () => {
  it.each(denials)(
    "denies $label before every action dependency",
    async (scenario) => {
      signIn(scenario.session);
      const {
        updateApplicationCaseAction,
        checkApplicationCaseSaveAction,
        prepareApplicationDraftAction,
        adoptApplicationDraftAction,
      } = await loadActions();
      const form = caseForm();
      const readForm = vi.spyOn(form, "get");

      const updateError = await rejection(
        updateApplicationCaseAction(
          scenario.targetId,
          "en",
          {status: "idle"},
          form,
        ),
      );
      const checkError = await rejection(
        checkApplicationCaseSaveAction(scenario.targetId, REQUEST_ID),
      );

      expect(updateError.message).toBe(scenario.denial);
      expect(checkError.message).toBe(scenario.denial);
      expect(readForm).not.toHaveBeenCalled();
      expect(await prepareApplicationDraftAction(scenario.targetId, "en")).toEqual({
        status: "forbidden",
      });
      expect(await adoptApplicationDraftAction(
        scenario.targetId,
        "en",
        adoptionInput(),
      )).toEqual({status: "forbidden"});

      expect(state.updateCase).not.toHaveBeenCalled();
      expect(state.getReceipt).not.toHaveBeenCalled();
      expect(state.prepareDraft).not.toHaveBeenCalled();
      expect(state.adoptDraft).not.toHaveBeenCalled();
      expect(state.revalidatePath).not.toHaveBeenCalled();
      if (!scenario.session) expect(state.resolveIdentity).not.toHaveBeenCalled();
    },
  );

  it("allows a positively authorized staff actor through all direct actions", async () => {
    signIn(staff);
    const {
      updateApplicationCaseAction,
      checkApplicationCaseSaveAction,
      prepareApplicationDraftAction,
      adoptApplicationDraftAction,
    } = await loadActions();

    expect(await updateApplicationCaseAction(
      MEMBER_A_ID,
      "en",
      {status: "idle"},
      caseForm(),
    )).toMatchObject({status: "saved", version: CASE_VERSION, requestId: REQUEST_ID});
    expect(await checkApplicationCaseSaveAction(MEMBER_A_ID, REQUEST_ID))
      .toMatchObject({status: "saved", version: CASE_VERSION, refreshRequired: true});
    expect(await prepareApplicationDraftAction(MEMBER_A_ID, "en")).toEqual({
      status: "created",
      reviewHref: `/admin/tasks?draft=${DRAFT_ID}`,
    });
    expect(await adoptApplicationDraftAction(
      MEMBER_A_ID,
      "en",
      adoptionInput(),
    )).toEqual({status: "adopted"});

    expect(state.updateCase).toHaveBeenCalledWith(
      expectedStaffActor,
      MEMBER_A_ID,
      expect.objectContaining({requestId: REQUEST_ID}),
    );
    expect(state.getReceipt).toHaveBeenCalledWith(
      expectedStaffActor,
      MEMBER_A_ID,
      REQUEST_ID,
    );
    expect(state.prepareDraft).toHaveBeenCalledWith(expectedStaffActor, MEMBER_A_ID);
    expect(state.adoptDraft).toHaveBeenCalledWith(
      expectedStaffActor,
      MEMBER_A_ID,
      adoptionInput(),
    );
    expect(state.resolveIdentity).toHaveBeenCalledWith(staff.authUserId);
  });
});

describe("application queue page security boundaries", () => {
  it.each(denials)(
    "redirects $label before queue list or detail reads",
    async (scenario) => {
      signIn(scenario.session);
      const {list, detail} = await loadQueuePages();

      await expect(list({
        params: Promise.resolve({locale: "en"}),
        searchParams: Promise.resolve({}),
      })).rejects.toThrow("NEXT_REDIRECT");
      expect(state.redirect).toHaveBeenLastCalledWith(adminLoginPath());

      state.redirect.mockClear();
      await expect(detail({
        params: Promise.resolve({locale: "en", id: scenario.targetId}),
        searchParams: Promise.resolve({}),
      })).rejects.toThrow("NEXT_REDIRECT");
      expect(state.redirect).toHaveBeenLastCalledWith(adminLoginPath(
        `/admin/members/queue/${scenario.targetId}`,
      ));

      expect(state.getQueue).not.toHaveBeenCalled();
      expect(state.getCase).not.toHaveBeenCalled();
      expect(state.listOwners).not.toHaveBeenCalled();
      expect(state.getTriage).not.toHaveBeenCalled();
      expect(state.notFound).not.toHaveBeenCalled();
      expect(state.getTranslations).not.toHaveBeenCalled();
    },
  );

  it("lets a positively authorized staff actor reach queue list and detail reads", async () => {
    signIn(staff);
    const {list, detail} = await loadQueuePages();

    const listElement = await list({
      params: Promise.resolve({locale: "en"}),
      searchParams: Promise.resolve({}),
    });
    expect(listElement).toBeTruthy();
    expect(state.getQueue).toHaveBeenCalledWith(
      expectedStaffActor,
      {status: "draft", search: "", sort: "updated_desc", limit: 20, cursor: null},
    );

    const detailElement = await detail({
      params: Promise.resolve({locale: "en", id: MEMBER_A_ID}),
      searchParams: Promise.resolve({}),
    });
    expect(detailElement).toBeTruthy();
    expect(state.getCase).toHaveBeenCalledWith(expectedStaffActor, MEMBER_A_ID);
    expect(state.listOwners).toHaveBeenCalledWith(expectedStaffActor);
    expect(state.getTriage).toHaveBeenCalledWith(expectedStaffActor, MEMBER_A_ID);
    expect(state.redirect).not.toHaveBeenCalled();
    expect(state.notFound).not.toHaveBeenCalled();
  });
});

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type {ReactNode} from "react";

import en from "@/messages/en.json";
import zhHK from "@/messages/zh-HK.json";
import type {
  ApplicationCaseLabels,
} from "@/components/admin/application-case-form";
import type {ApplicationCase} from "@/lib/admin/application-case-types";
import type {ApplicationCaseState} from "@/lib/admin/application-case-actions";
import type {AdminActor, Actor} from "@/lib/membership/lifecycle";

type Locale = "en" | "zh-HK";
type Viewport = "desktop" | "mobile";
type Cell = Readonly<{
  locale: Locale;
  viewport: Viewport;
  width: number;
}>;

const cells: readonly Cell[] = [
  {locale: "en", viewport: "desktop", width: 1440},
  {locale: "en", viewport: "mobile", width: 390},
  {locale: "zh-HK", viewport: "desktop", width: 1440},
  {locale: "zh-HK", viewport: "mobile", width: 390},
];

const MEMBER_A_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_B_ID = "22222222-2222-4222-8222-222222222222";
const MISSING_ID = "33333333-3333-4333-8333-333333333333";
const OWNER_ID = "44444444-4444-4444-8444-444444444444";
const VERSION_ID = "55555555-5555-4555-8555-555555555555";
const INTERNAL_MARKER = "B-INTERNAL-APPLICATION-MARKER";

const state = vi.hoisted(() => ({
  actor: null as Actor | null,
  locale: "en" as Locale,
  listOwned: vi.fn(),
  getOwnedById: vi.fn(),
  listOwnedPage: vi.fn(),
  getQueuePage: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
  requireAdminActor: vi.fn(),
  getTranslations: vi.fn(),
  getLocale: vi.fn(),
}));

vi.mock("@/lib/auth/actor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/actor")>();
  const requireAdmin: (actor: Actor) => asserts actor is AdminActor =
    actual.requireAdmin;
  return {
    ...actual,
    getActor: async () => state.actor,
    requireAdminActor: async () => {
      state.requireAdminActor();
      if (!state.actor) throw new Error("UNAUTHORIZED");
      requireAdmin(state.actor);
      return state.actor as AdminActor;
    },
  };
});

vi.mock("@/lib/db/repos/applications", () => ({
  applicationsRepository: {
    listOwned: state.listOwned,
    getOwnedById: state.getOwnedById,
    listOwnedPage: state.listOwnedPage,
  },
}));

vi.mock("@/lib/db/repos/admin-members", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/db/repos/admin-members")>();
  return {
    ...actual,
    adminMembersRepository: {
      ...actual.adminMembersRepository,
      getApplicationQueuePage: state.getQueuePage,
    },
  };
});

vi.mock("@/components/internal-shell/private-link", () => ({
  PrivateLink: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  redirect: state.redirect,
  permanentRedirect: state.redirect,
  usePathname: () => "/",
  useRouter: () => ({push: vi.fn(), replace: vi.fn(), prefetch: vi.fn()}),
}));

vi.mock("next/navigation", () => ({
  redirect: state.redirect,
  notFound: state.notFound,
}));

vi.mock("next-intl/server", () => ({
  getLocale: state.getLocale,
  getTranslations: state.getTranslations,
  setRequestLocale: vi.fn(),
}));

import ApplicationDetailPage from "@/app/[locale]/(member)/portal/applications/[id]/page";
import ApplicationsPage from "@/app/[locale]/(member)/portal/applications/page";
import AdminApplicationQueuePage from "@/app/[locale]/(admin)/admin/members/queue/page";
import {ApplicationCaseForm} from "@/components/admin/application-case-form";

function messageCopy(locale: Locale) {
  return locale === "zh-HK" ? zhHK : en;
}

function translated(
  locale: Locale,
  namespace: string,
  key: string,
  values?: Record<string, string | number>,
) {
  const found = key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        (node as Record<string, unknown> | undefined)?.[part],
      (messageCopy(locale) as Record<string, unknown>)[namespace],
    );
  const text = typeof found === "string" ? found : `${namespace}.${key}`;
  return text.replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values?.[name] ?? ""),
  );
}

function applicationRecord(
  id: string,
  applicantUserId: string,
  updatedAt = "2026-10-02T02:30:00.000Z",
) {
  return {
    id,
    applicantUserId,
    planCode: "startup" as const,
    companyId: null,
    currentStep: "company" as const,
    status: "draft" as const,
    createdAt: new Date("2026-10-01T01:00:00.000Z"),
    updatedAt: new Date(updatedAt),
  };
}

function applicationCase(locale: Locale): ApplicationCase {
  return {
    profile: {
      email: "applicant-a@example.test",
      phone: null,
      jobTitle: null,
      locale,
      onboardingState: "profile",
    },
    company: null,
    application: {
      id: MEMBER_A_ID,
      profileId: "member-a",
      name: "Synthetic applicant A",
      companyId: null,
      companyName: null,
      planCode: "startup",
      status: "draft",
      step: "profile",
      createdAt: "2026-10-16T01:00:00.000Z",
      updatedAt: "2026-10-16T01:00:00.000Z",
    },
    membership: null,
    payment: null,
    version: VERSION_ID,
    ownerProfileId: null,
    dueAt: null,
    missingFields: [],
    nextActionCode: "none",
    timeline: [],
  };
}

function formLabels(locale: Locale): ApplicationCaseLabels {
  const copy = messageCopy(locale).Admin.applicationCase;
  return {
    title: copy.followUp,
    description: copy.descriptionFor.replace(
      "{name}",
      "Synthetic applicant A",
    ),
    owner: copy.owner,
    unassigned: copy.unassigned,
    due: copy.due,
    missing: copy.missing,
    nextAction: copy.nextAction,
    note: copy.note,
    save: copy.save,
    saving: copy.saving,
    saved: copy.saved,
    conflict: copy.conflict,
    error: copy.error,
    refresh: copy.refresh,
    unknown: copy.unknown,
    checkResult: copy.checkResult,
    checking: copy.checking,
    changed: copy.changed,
    savedRefreshRequired: copy.savedRefreshRequired,
    reference: copy.reference,
    missingFields: {...copy.missingFields},
    nextActions: {...copy.nextActions},
  };
}

function renderCell(cell: Cell, node: ReactNode) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: cell.width,
  });
  window.dispatchEvent(new Event("resize"));
  return render(
    <div
      data-testid="jsdom-viewport"
      data-locale={cell.locale}
      data-viewport={cell.viewport}
    >
      {node}
    </div>,
  );
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

beforeEach(() => {
  vi.clearAllMocks();
  state.actor = {
    kind: "member",
    userId: "auth-member-a",
    profileId: "member-a",
  };
  state.locale = "en";
  state.listOwned.mockResolvedValue([
    applicationRecord(MEMBER_A_ID, "member-a"),
    applicationRecord(MEMBER_B_ID, "member-b"),
  ]);
  // Deliberately return a hostile foreign row too: the projection must reject it.
  state.getOwnedById.mockImplementation(async (_actor: Actor, id: string) => {
    if (id === MEMBER_A_ID) return applicationRecord(id, "member-a");
    if (id === MEMBER_B_ID) return applicationRecord(id, "member-b");
    return null;
  });
  state.listOwnedPage.mockResolvedValue({items: [applicationRecord(MEMBER_A_ID, "member-a"), applicationRecord(MEMBER_B_ID, "member-b")], nextCursor: null});
  state.getQueuePage.mockResolvedValue({
    items: [],
    nextCursor: null,
    totalMatching: 0,
    counts: {draft: 0, pending_payment: 0, pending_review: 0},
  });
  state.redirect.mockImplementation((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  });
  state.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
  state.getLocale.mockImplementation(async () => state.locale);
  state.getTranslations.mockImplementation(
    async ({locale, namespace}: {locale: Locale; namespace: string}) =>
      Object.assign(
        (
          key: string,
          values?: Record<string, string | number>,
        ) => translated(locale, namespace, key, values),
        {
          has: (key: string) =>
            translated(locale, namespace, key) !==
            `${namespace}.${key}`,
          raw: (key: string) => translated(locale, namespace, key),
        },
      ),
  );
});

describe.each(cells)(
  "application security UI ($locale, $viewport jsdom label)",
  (cell) => {
    it("renders only the owned list/detail row and keeps responsive markup", async () => {
      state.locale = cell.locale;

      const list = renderCell(
        cell,
        await ApplicationsPage({
          params: Promise.resolve({locale: cell.locale}),
        }),
      );
      expect(screen.getByTestId("jsdom-viewport")).toHaveAttribute(
        "data-viewport",
        cell.viewport,
      );
      expect(
        list.container.querySelector(
          `[data-application-id="${MEMBER_A_ID}"]`,
        ),
      ).not.toBeNull();
      expect(list.container.innerHTML).not.toContain(MEMBER_B_ID);
      expect(list.container.innerHTML).toContain("xl:grid-cols-2");
      expect(state.listOwnedPage).toHaveBeenCalledWith(state.actor, {cursor: undefined});

      const detail = renderCell(
        cell,
        await ApplicationDetailPage({
          params: Promise.resolve({
            locale: cell.locale,
            id: MEMBER_A_ID,
          }),
        }),
      );
      expect(state.getOwnedById).toHaveBeenCalledWith(state.actor, MEMBER_A_ID);
      expect(state.listOwned).not.toHaveBeenCalled();
      expect(detail.container.innerHTML).toContain(MEMBER_A_ID);
      expect(detail.container.innerHTML).not.toContain(MEMBER_B_ID);
      expect(detail.container.innerHTML).toContain("sm:grid-cols-2");
      expect(detail.container.innerHTML).not.toMatch(
        /private_database_text|application_case_|auth-member-b|member-b@example\.test/i,
      );
    });

    it("gives foreign and nonexistent IDs the same generic rejection", async () => {
      state.locale = cell.locale;

      const denied = await rejection(
        ApplicationDetailPage({
          params: Promise.resolve({
            locale: cell.locale,
            id: MEMBER_B_ID,
          }),
        }),
      );
      const missing = await rejection(
        ApplicationDetailPage({
          params: Promise.resolve({
            locale: cell.locale,
            id: MISSING_ID,
          }),
        }),
      );

      expect(denied.message).toBe("NEXT_NOT_FOUND");
      expect(missing.message).toBe("NEXT_NOT_FOUND");
      expect(denied.message).toBe(missing.message);
      expect(JSON.stringify(denied)).not.toMatch(
        new RegExp(`${MEMBER_B_ID}|${INTERNAL_MARKER}`, "i"),
      );
      expect(state.notFound).toHaveBeenCalledTimes(2);
    });

    it("redirects an expired member and a non-admin before reads", async () => {
      state.locale = cell.locale;
      const prefix = cell.locale === "zh-HK" ? "/zh" : "";

      state.actor = null;
      await expect(
        ApplicationsPage({
          params: Promise.resolve({locale: cell.locale}),
        }),
      ).rejects.toThrow(
        `NEXT_REDIRECT:${prefix}/member-login?next=%2Fportal%2Fapplications`,
      );
      expect(state.listOwnedPage).not.toHaveBeenCalled();

      state.redirect.mockClear();
      await expect(
        AdminApplicationQueuePage({
          params: Promise.resolve({locale: cell.locale}),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toThrow(`NEXT_REDIRECT:${prefix}/admin-login`);
      expect(state.getQueuePage).not.toHaveBeenCalled();

      state.redirect.mockClear();
      state.actor = {
        kind: "member",
        userId: "auth-member-a",
        profileId: "member-a",
      };
      await expect(
        AdminApplicationQueuePage({
          params: Promise.resolve({locale: cell.locale}),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toThrow(`NEXT_REDIRECT:${prefix}/admin-login`);
      expect(state.getQueuePage).not.toHaveBeenCalled();
    });

    it("retains form values and shows only the generic save error", async () => {
      const labels = formLabels(cell.locale);
      const save = vi.fn(async () => ({
        status: "error",
        detail: INTERNAL_MARKER,
      } as ApplicationCaseState));
      const rendered = renderCell(
        cell,
        <ApplicationCaseForm
          record={applicationCase(cell.locale)}
          owners={[{id: OWNER_ID, name: "Synthetic owner"}]}
          labels={labels}
          action={save}
          refreshHref="/admin/members/queue/current"
        />,
      );

      fireEvent.change(screen.getByLabelText(labels.owner), {
        target: {value: OWNER_ID},
      });
      fireEvent.change(screen.getByLabelText(labels.due), {
        target: {value: "2030-12-01T10:00"},
      });
      fireEvent.change(screen.getByLabelText(labels.nextAction), {
        target: {value: "await_documents"},
      });
      fireEvent.click(
        screen.getByRole("checkbox", {
          name: labels.missingFields.companyWebsite,
        }),
      );
      fireEvent.change(screen.getByLabelText(labels.note), {
        target: {value: "Retain this synthetic follow-up"},
      });

      const form = screen
        .getByRole("button", {name: labels.save})
        .closest("form")!;
      await act(async () => {
        form.requestSubmit();
      });

      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(labels.error),
      );
      expect(screen.getByLabelText(labels.owner)).toHaveValue(OWNER_ID);
      expect(screen.getByLabelText(labels.due)).toHaveValue(
        "2030-12-01T10:00",
      );
      expect(screen.getByLabelText(labels.nextAction)).toHaveValue(
        "await_documents",
      );
      expect(
        screen.getByRole("checkbox", {
          name: labels.missingFields.companyWebsite,
        }),
      ).toBeChecked();
      expect(screen.getByLabelText(labels.note)).toHaveValue(
        "Retain this synthetic follow-up",
      );
      expect(rendered.container.innerHTML).toContain("sm:grid-cols-2");
      expect(rendered.container.innerHTML).toContain("sm:p-6");
      expect(rendered.container.innerHTML).not.toMatch(
        /b-internal-application-marker|application_case_request_mismatch|private_database_text/i,
      );
    });
  },
);

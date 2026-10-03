import { PrivateLink as Link } from "@/components/internal-shell/private-link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ApplicationQueueTable,
  type ApplicationQueueLabels,
} from "@/components/admin/application-queue-table";
import type { AppLocale } from "@/i18n/routing";
import { requireAdminPageActor } from "@/lib/admin/page-auth";
import {
  adminMembersRepository,
  applicationQueueQuerySchema,
} from "@/lib/db/repos/admin-members";
import {
  MEMBERSHIP_PLAN_CODES,
  MEMBERSHIP_STATUSES,
} from "@/lib/membership/constants";
import { localizedPath } from "@/lib/urls";

type Props = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;
export default async function AdminApplicationQueuePage({
  params,
  searchParams,
}: Props) {
  const { locale: value } = await params;
  const locale = value as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const t = await getTranslations({ locale, namespace: "Admin" });
  const raw = await searchParams;
  const query = applicationQueueQuerySchema.safeParse({
    status: raw.status,
    search: raw.q,
    limit: raw.limit,
    cursor: raw.cursor ?? null,
  });
  const base = localizedPath(locale, "/admin/members/queue");
  const states = ["draft", "pending_payment", "pending_review"] as const;
  let page: Awaited<
    ReturnType<typeof adminMembersRepository.getApplicationQueuePage>
  > | null = null;
  if (query.success) {
    try {
      page = await adminMembersRepository.getApplicationQueuePage(
        actor,
        query.data,
      );
    } catch {
      /* A failed read is shown as unavailable, never an empty queue. */
    }
  }
  const labels: ApplicationQueueLabels = {
    caption: t("applicationQueue.caption"),
    applicant: t("applicationQueue.applicant"),
    application: t("applicationQueue.application"),
    company: t("members.company"),
    plan: t("members.plan"),
    step: t("applicationQueue.step"),
    membership: t("applicationQueue.membership"),
    billing: t("applicationQueue.billing"),
    updated: t("applicationQueue.updated"),
    none: t("applicationQueue.none"),
    empty: t("applicationQueue.empty"),
    states: {
      ...Object.fromEntries(
        MEMBERSHIP_STATUSES.map((status) => [
          status,
          t(`members.statusCodes.${status}`),
        ]),
      ),
      draft: t("applicationQueue.draft"),
    },
    steps: Object.fromEntries(
      ["profile", "company", "checkout", "complete", "review"].map((step) => [
        step,
        t(`applicationQueue.steps.${step}`),
      ]),
    ),
    plans: Object.fromEntries(
      MEMBERSHIP_PLAN_CODES.map((plan) => [
        plan,
        t(`members.planCodes.${plan}`),
      ]),
    ),
    billingStates: Object.fromEntries(
      ["active", "completed", "abandoned", "expired"].map((state) => [
        state,
        t(`applicationQueue.billingStates.${state}`),
      ]),
    ),
  };
  const next =
    query.success && page?.nextCursor
      ? `${base}?${new URLSearchParams({ status: query.data.status, q: query.data.search, limit: String(query.data.limit), cursor: page.nextCursor })}`
      : null;
  const returnTo = query.success
    ? base +
      "?" +
      new URLSearchParams({
        status: query.data.status,
        q: query.data.search,
        limit: String(query.data.limit),
        ...(query.data.cursor ? { cursor: query.data.cursor } : {}),
      })
    : base;
  return (
    <div className="space-y-6">
      <Link
        className="text-primary underline"
        href={localizedPath(locale, "/admin/members")}
      >
        {t("applicationQueue.back")}
      </Link>
      <header className="space-y-3">
        <h1 className="font-serif text-4xl font-semibold">
          {t("applicationQueue.title")}
        </h1>
        <p className="text-muted-foreground">
          {t("applicationQueue.description")}
        </p>
      </header>
      <nav
        aria-label={t("applicationQueue.views")}
        className="flex flex-wrap gap-3"
      >
        {states.map((state) => (
          <Link
            aria-current={
              query.success && query.data.status === state ? "page" : undefined
            }
            className="min-h-11 rounded-md border px-3 py-2"
            href={`${base}?status=${state}`}
            key={state}
          >
            {t(`applicationQueue.viewsLabels.${state}`)}
          </Link>
        ))}
      </nav>
      <form
        action={base}
        className="flex flex-wrap items-end gap-3"
        method="get"
      >
        <input
          name="status"
          type="hidden"
          value={query.success ? query.data.status : "draft"}
        />
        <label className="grid gap-1">
          {t("applicationQueue.search")}
          <input
            className="min-h-11 rounded-md border bg-background px-3"
            defaultValue={query.success ? query.data.search : ""}
            maxLength={120}
            name="q"
            type="search"
          />
        </label>
        <button className="min-h-11 rounded-md border px-4" type="submit">
          {t("members.search")}
        </button>
        <Link className="min-h-11 px-3 py-2 text-primary underline" href={base}>
          {t("members.filters.clear")}
        </Link>
      </form>
      {!query.success ? (
        <p role="alert">{t("applicationQueue.invalid")}</p>
      ) : !page ? (
        <p role="alert">{t("applicationQueue.unavailable")}</p>
      ) : (
        <ApplicationQueueTable
          returnTo={returnTo}
          locale={locale}
          items={page.items}
          labels={labels}
        />
      )}
      {next ? (
        <Link
          className="inline-flex min-h-11 items-center rounded-md border px-4"
          href={next}
        >
          {t("members.next")}
        </Link>
      ) : null}
    </div>
  );
}

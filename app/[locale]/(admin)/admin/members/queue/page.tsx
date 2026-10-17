import { PrivateLink as Link } from "@/components/internal-shell/private-link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ApplicationQueueTable,
  type ApplicationQueueLabels,
} from "@/components/admin/application-queue-table";
import type { AppLocale } from "@/i18n/routing";
import { requireAdminPageActor } from "@/lib/admin/page-auth";
import {
  APPLICATION_QUEUE_STATUSES,
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
    sort: raw.sort,
    limit: raw.limit,
    cursor: raw.cursor ?? null,
  });
  const base = localizedPath(locale, "/admin/members/queue");
  const selectedStatus = query.success ? query.data.status : "draft";
  const selectedSearch = query.success ? query.data.search : "";
  const selectedSort = query.success ? query.data.sort : "updated_desc";
  const selectedLimit = query.success ? query.data.limit : 20;
  const queueHref = (input: {
    status?: (typeof APPLICATION_QUEUE_STATUSES)[number];
    search?: string;
    sort?: "updated_desc" | "updated_asc";
    limit?: number;
    cursor?: string | null;
  }) => {
    const params = new URLSearchParams({
      status: input.status ?? selectedStatus,
      q: input.search ?? selectedSearch,
      sort: input.sort ?? selectedSort,
      limit: String(input.limit ?? selectedLimit),
    });
    if (input.cursor) params.set("cursor", input.cursor);
    return `${base}?${params}`;
  };
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
  const next = query.success && page?.nextCursor
    ? queueHref({cursor: page.nextCursor})
    : null;
  const returnTo = query.success
    ? queueHref({cursor: query.data.cursor})
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
        {APPLICATION_QUEUE_STATUSES.map((state) => (
          <Link
            aria-current={
              selectedStatus === state ? "page" : undefined
            }
            className="min-h-11 rounded-md border px-3 py-2"
            href={queueHref({status: state})}
            key={state}
          >
            {t(`applicationQueue.viewsLabels.${state}`)}
            {page ? ` (${page.counts[state]})` : null}
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
          value={selectedStatus}
        />
        <label className="grid gap-1">
          {t("applicationQueue.search")}
          <input
            className="min-h-11 rounded-md border bg-background px-3"
            defaultValue={selectedSearch}
            maxLength={120}
            name="q"
            type="search"
          />
        </label>
        <label className="grid gap-1">
          {t("applicationQueue.sort")}
          <select
            className="min-h-11 rounded-md border bg-background px-3"
            defaultValue={selectedSort}
            name="sort"
          >
            <option value="updated_desc">
              {t("applicationQueue.sortNewest")}
            </option>
            <option value="updated_asc">
              {t("applicationQueue.sortOldest")}
            </option>
          </select>
        </label>
        <label className="grid gap-1">
          {t("applicationQueue.pageSize")}
          <select
            className="min-h-11 rounded-md border bg-background px-3"
            defaultValue={String(selectedLimit)}
            name="limit"
          >
            {[10, 20, 50].map((limit) => (
              <option key={limit} value={limit}>
                {limit}
              </option>
            ))}
          </select>
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
        <>
          <p className="text-sm text-muted-foreground" role="status">
            {t("applicationQueue.totalMatching", {
              count: page.totalMatching,
            })}
          </p>
          <ApplicationQueueTable
            returnTo={returnTo}
            locale={locale}
            items={page.items}
            labels={labels}
          />
        </>
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

import {getTranslations, setRequestLocale} from "next-intl/server";
import Link from "next/link";

import {
  ContactPipelineTable,
  type ContactPipelineFilterState,
} from "@/components/admin/contact-pipeline-table";
import type {AppLocale} from "@/i18n/routing";
import {listContacts} from "@/lib/admin/contacts";
import {updateContactPipelineAction} from "@/lib/admin/contact-actions";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {
  CONTACT_SOURCES,
  CONTACT_STAGES,
  type ContactSource,
  type ContactStage,
} from "@/lib/db/repos/contacts";
import {localizedPath} from "@/lib/urls";

type Query = Record<string, string | string[] | undefined>;
type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Query>}>;

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * Every filter arrives from a `<form method="get">`, so every value below is
 * untrusted: anything unrecognised becomes "no filter" here rather than
 * reaching the repository, which would refuse it with a ZodError and turn a
 * mistyped link into the error state. The repository parses again regardless —
 * this is the page being kind, not the page being the gate.
 */
function stageFrom(value: string): ContactStage | "" {
  return (CONTACT_STAGES as readonly string[]).includes(value) ? value as ContactStage : "";
}

function sourceFrom(value: string): ContactSource | "" {
  return (CONTACT_SOURCES as readonly string[]).includes(value) ? value as ContactSource : "";
}

function optInFrom(value: string): "" | "yes" | "no" {
  return value === "yes" || value === "no" ? value : "";
}

export default async function AdminContactsPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const query = await searchParams;
  const t = await getTranslations({locale, namespace: "Admin.contacts"});

  const filters: ContactPipelineFilterState = {
    stage: stageFrom(single(query.stage)),
    source: sourceFrom(single(query.source)),
    // Clamped, not validated against a staff list: the repository refuses a
    // value longer than its column, and a mistyped URL should narrow the page
    // to nothing rather than render the error state a ZodError would produce.
    owner: single(query.owner).slice(0, 255),
    optIn: optInFrom(single(query.optIn)),
    q: single(query.q).slice(0, 200),
  };
  const cursor = single(query.cursor);

  const page = await listContacts(actor, {
    stage: filters.stage === "" ? [] : [filters.stage],
    source: filters.source === "" ? [] : [filters.source],
    ownerProfileId: filters.owner === "" ? null : filters.owner,
    optIn: filters.optIn === "" ? null : filters.optIn === "yes",
    q: filters.q,
    cursor: cursor === "" ? null : cursor,
  // A public-facing read degrades; a staff read must not pretend the pipeline is
  // empty when the database is unreachable, because "no prospects" and "we could
  // not ask" lead to opposite actions.
  }).catch(() => null);

  // The INTERNAL app-router path: `revalidatePath` does not go through
  // `localizedPath`, and `/zh-HK/…` is the correct spelling there.
  const path = `/${locale}/admin/contacts`;
  const browserPath = localizedPath(locale, "/admin/contacts");
  const returnParams = new URLSearchParams();
  if (filters.stage) returnParams.set("stage", filters.stage);
  if (filters.source) returnParams.set("source", filters.source);
  if (filters.owner) returnParams.set("owner", filters.owner);
  if (filters.optIn) returnParams.set("optIn", filters.optIn);
  if (filters.q) returnParams.set("q", filters.q);
  if (cursor) returnParams.set("cursor", cursor);
  returnParams.set("saved", "1");
  // Where the save sends the browser back to, filters and page intact. The
  // action allowlists this value before redirecting to it (contact-action-core),
  // because it travels through the form and is therefore client-supplied.
  const returnTo = `${browserPath}?${returnParams.toString()}`;

  const nextParams = new URLSearchParams(returnParams);
  nextParams.delete("saved");

  const header = (
    <header className="space-y-3">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
      <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1>
      <p className="text-lg text-muted-foreground">{t("description")}</p>
      {single(query.saved) === "1" ? <p className="rounded-md border border-border/70 bg-muted/40 px-4 py-3 text-sm" role="status">{t("saved")}</p> : null}
    </header>
  );

  if (page === null) {
    return <div className="space-y-8">{header}<p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-4 text-destructive" role="alert">{t("error")}</p></div>;
  }

  const labels = {
    caption: t("title"),
    columns: {
      name: t("columns.name"),
      stage: t("columns.stage"),
      source: t("columns.source"),
      owner: t("columns.owner"),
      lastInbound: t("columns.lastInbound"),
      optIn: t("columns.optIn"),
      actions: t("columns.actions"),
    },
    stage: {
      new: t("stage.new"),
      contacted: t("stage.contacted"),
      qualified: t("stage.qualified"),
      applied: t("stage.applied"),
      member: t("stage.member"),
      closed: t("stage.closed"),
    },
    source: {
      whatsapp: t("source.whatsapp"),
      event_guest: t("source.event_guest"),
      showcase_intro: t("source.showcase_intro"),
      join_abandoned: t("source.join_abandoned"),
      interest_form: t("source.interest_form"),
      import: t("source.import"),
    },
    optIn: {yes: t("optIn.yes"), no: t("optIn.no"), stopped: t("optIn.stopped")},
    filters: {
      stage: t("filters.stage"),
      source: t("filters.source"),
      owner: t("filters.owner"),
      search: t("filters.search"),
      anyStage: t("filters.anyStage"),
      anySource: t("filters.anySource"),
      anyOwner: t("filters.anyOwner"),
      anyOptIn: t("filters.anyOptIn"),
      submit: t("filters.submit"),
      clear: t("filters.clear"),
    },
    unassigned: t("unassigned"),
    assign: t("assign"),
    assignToMe: t("assignToMe"),
    save: t("save"),
    openThread: t("openThread"),
    noThread: t("noThread"),
    convert: t("convert"),
    linkedMember: t("linkedMember"),
    duplicates: (count: number) => t("duplicates", {count}),
    empty: t("empty"),
  } as const;

  return (
    <div className="space-y-8">
      {header}
      <section className="glass-card p-6">
        <ContactPipelineTable
          actorProfileId={actor.profileId}
          filters={filters}
          labels={labels}
          locale={locale}
          returnTo={returnTo}
          rows={page.items}
          updateAction={updateContactPipelineAction.bind(null, path)}
        />
        {page.nextCursor === null ? null : (
          <nav aria-label={t("next")} className="mt-6 flex justify-end text-sm">
            <Link
              className="rounded-md border border-border px-3 py-2 hover:bg-muted"
              href={`${browserPath}?${new URLSearchParams({...Object.fromEntries(nextParams), cursor: page.nextCursor}).toString()}`}
            >
              {t("next")}
            </Link>
          </nav>
        )}
      </section>
    </div>
  );
}

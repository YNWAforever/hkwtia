import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";
import {z} from "zod";

import {LeadNextStepForm} from "@/components/admin/lead-next-step-form";
import {LeadNoteForm} from "@/components/admin/lead-note-form";
import {LeadTimeline} from "@/components/admin/lead-timeline";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {addContactNoteAction, updateContactNextStepAction} from "@/lib/admin/contact-actions";
import {getContact, getContactRelated, listContactActivities} from "@/lib/admin/contacts";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {CONTACT_STAGES} from "@/lib/db/repos/contacts";
import {localizedPath} from "@/lib/urls";

type Props = Readonly<{
  params: Promise<{locale: string; id: string}>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>;

const idSchema = z.string().uuid();

/** The calendar day the due instant falls on in Hong Kong, as `<input type="date">` wants it. */
function hongKongDay(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit"}).format(value);
}

/** A due instant is 18:00 Hong Kong on the due day, so "overdue" is simply "already past". */
function isPast(value: Date | null): boolean {
  return value !== null && value.getTime() < Date.now();
}

/**
 * Phase E. The page a salesperson works one lead from.
 *
 * A non-admin and an unknown id get the same `notFound()`: the page must not be
 * an oracle for which contact ids exist. A database outage is NOT folded into
 * that 404 — "this lead does not exist" and "we could not ask" lead to opposite
 * actions, so only a denial or a null row becomes one.
 */
export default async function AdminLeadPage({params, searchParams}: Props) {
  const {locale: localeValue, id} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  // Before the database: a path like `/admin/contacts/../x` must not reach a
  // query that would answer with a ZodError (a 500) instead of a 404.
  if (!idSchema.safeParse(id).success) notFound();
  const actor = await requireAdminPageActor();
  const query = searchParams ? await searchParams : {};
  const t = await getTranslations({locale, namespace: "Admin.contacts"});

  let contact: Awaited<ReturnType<typeof getContact>>;
  try {
    contact = await getContact(actor, id);
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
  if (contact === null) notFound();

  const [activities, related] = await Promise.all([
    listContactActivities(actor, id),
    getContactRelated(actor, id),
  ]);

  const formatter = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong"});
  const dayFormatter = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeZone: "Asia/Hong_Kong"});
  // The INTERNAL app-router path for `revalidatePath` (`/zh-HK/…` is right
  // there); the browser path for the redirect, which the action allowlists.
  const path = `/${locale}/admin/contacts/${id}`;
  const returnTo = `${localizedPath(locale, `/admin/contacts/${id}`)}?saved=1`;
  const saved = (Array.isArray(query.saved) ? query.saved[0] : query.saved) === "1";

  const name = contact.displayName ?? contact.email ?? contact.phoneE164 ?? t("lead.unnamed");
  const overdue = isPast(contact.nextStepDueAt);
  const consent = contact.whatsappOptedOutAt !== null ? t("optIn.stopped") : contact.whatsappOptIn ? t("optIn.yes") : t("optIn.no");
  const stageLabel = (code: string): string => {
    const known = CONTACT_STAGES.find((stage) => stage === code);
    return known ? t(`stage.${known}`) : code;
  };
  const hasRelated = related.guestEvents.length > 0 || related.showcaseIntros.length > 0 || related.membership !== null || contact.conversationId !== null;

  return (
    <div className="space-y-8">
      <Link className="text-sm text-primary underline" href="/admin/contacts" prefetch={false}>{t("lead.back")}</Link>
      <header className="space-y-3">
        <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{name}</h1>
        {contact.organisation ? <p className="text-lg text-muted-foreground">{contact.organisation}</p> : null}
        {contact.email ? <p className="text-sm text-muted-foreground">{contact.email}</p> : null}
        {contact.phoneE164 ? <p className="text-sm text-muted-foreground">{contact.phoneE164}</p> : null}
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">{t("lead.source")}</dt><dd>{t(`source.${contact.source}`)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{t("lead.stage")}</dt><dd>{t(`stage.${contact.stage}`)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{t("lead.owner")}</dt><dd>{contact.ownerName ?? t("unassigned")}</dd></div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("lead.consent")}</dt>
            <dd className={contact.whatsappOptedOutAt !== null ? "text-destructive" : undefined}>{consent}</dd>
          </div>
        </dl>
        {saved ? <p className="rounded-md border border-border/70 bg-muted/40 px-4 py-3 text-sm" role="status">{t("lead.saved")}</p> : null}
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="glass-card p-6">
          <LeadNextStepForm
            action={updateContactNextStepAction.bind(null, path)}
            contactId={id}
            dueDate={contact.nextStepDueAt ? hongKongDay(contact.nextStepDueAt) : ""}
            labels={{
              title: t("lead.nextStep.title"), label: t("lead.nextStep.label"), due: t("lead.nextStep.due"),
              save: t("lead.nextStep.save"), overdue: t("lead.nextStep.overdue"), none: t("lead.nextStep.none"),
            }}
            nextStep={contact.nextStep ?? ""}
            overdue={overdue}
            returnTo={returnTo}
          />
        </section>
        <section className="glass-card p-6">
          <LeadNoteForm
            action={addContactNoteAction.bind(null, path)}
            contactId={id}
            labels={{title: t("lead.notes.title"), label: t("lead.notes.label"), add: t("lead.notes.add")}}
            returnTo={returnTo}
          />
        </section>
      </div>

      <section className="glass-card space-y-4 p-6">
        <h2 className="font-serif text-xl font-semibold">{t("lead.timeline.title")}</h2>
        <LeadTimeline
          activities={activities}
          formatter={formatter}
          labels={{
            empty: t("lead.timeline.empty"),
            system: t("lead.timeline.system"),
            by: (who) => t("lead.timeline.by", {name: who}),
            kinds: {
              note: t("lead.timeline.note"), owner_change: t("lead.timeline.owner_change"),
              next_step: t("lead.timeline.next_step"), invite_sent: t("lead.timeline.invite_sent"),
              invite_opened: t("lead.timeline.invite_opened"), applied: t("lead.timeline.applied"),
              became_member: t("lead.timeline.became_member"),
            },
            stageChange: (from, to) => t("lead.timeline.stage_change", {from, to}),
          }}
          stageLabel={stageLabel}
        />
      </section>

      {hasRelated ? (
        <section className="glass-card space-y-6 p-6">
          <h2 className="font-serif text-xl font-semibold">{t("lead.related.title")}</h2>
          {related.guestEvents.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t("lead.related.events")}</h3>
              <ul className="space-y-1 text-sm">
                {related.guestEvents.map((event) => (
                  <li key={event.registrationId}>
                    <span>{locale === "zh-HK" ? event.titleZh ?? event.titleEn : event.titleEn}</span>
                    {" · "}
                    <span className="text-muted-foreground">{dayFormatter.format(event.startsAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {related.showcaseIntros.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t("lead.related.intros")}</h3>
              <ul className="space-y-1 text-sm">
                {related.showcaseIntros.map((intro) => (
                  <li key={intro.leadId}>
                    <span>{locale === "zh-HK" ? intro.nameZh : intro.nameEn}</span>
                    {" · "}
                    <span className="text-muted-foreground">{dayFormatter.format(intro.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {contact.conversationId !== null ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t("lead.related.conversation")}</h3>
              <Link className="text-sm text-primary underline" href={`/admin/inbox/${contact.conversationId}`} prefetch={false}>{t("openThread")}</Link>
            </div>
          ) : null}
          {related.membership !== null ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t("lead.related.membership")}</h3>
              <p className="text-sm">{t("lead.related.membershipLine", {plan: related.membership.planCode, status: related.membership.status})}</p>
              {contact.profileId !== null ? <Link className="text-sm text-primary underline" href={`/admin/members/${contact.profileId}`} prefetch={false}>{t("linkedMember")}</Link> : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

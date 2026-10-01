import {randomUUID} from "node:crypto";
import {notFound} from "next/navigation";
import Link from "next/link";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {z} from "zod";

import {PaymentReconciliationForm} from "@/components/admin/payment-reconciliation-form";
import {reconcileMembershipPaymentAction} from "@/lib/admin/payment-reconciliation-actions";
import {MemberMaintenanceSummary} from "@/components/admin/member-maintenance-summary";
import {workQueueRepository,WORK_ACTIONS} from "@/lib/admin/work-queue";
import {Member360View} from "@/components/admin/member-360";
import {MemberNoteForm} from "@/components/admin/member-note-form";
import {MemberProfileForm} from "@/components/admin/member-profile-form";
import {MembershipCompForm} from "@/components/admin/membership-comp-form";
import {MembershipGrantForm} from "@/components/admin/membership-grant-form";
import type {AppLocale} from "@/i18n/routing";
import type {Member360} from "@/lib/admin/member-360";
import {parsePageQuery} from "@/lib/admin/pagination";
import {adminMembersRepository, memberTimelineKindSchema, type MemberTimelineKind, type MemberTimelineResult} from "@/lib/db/repos/admin-members";
import {appendMemberNoteAction} from "@/lib/admin/member-note-actions";
import {updateMemberProfileAction} from "@/lib/admin/member-profile-actions";
import {grantMembershipAction} from "@/lib/admin/membership-grant-actions";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {getEditableMemberProfile} from "@/lib/db/repos/admin-member-profile";
import {adminMemberListHref, parseAdminMemberHistory, parseAdminMemberRouteQuery} from "@/lib/admin/member-types";

const profileIdSchema = z.string().min(1);
const retainedListKeys = ["q", "status", "planCode", "renewalFrom", "renewalTo", "companyId", "locale", "completeness", "sort", "limit", "cursor", "history"] as const;

type Props = Readonly<{
  params: Promise<{locale: string; id: string}>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>;

function withTimeline(summary: Member360, result: MemberTimelineResult | null): Member360 {
  if (!result) return summary;
  // The repository validates and maps each kind with its own schema before this view projection.
  const items = result.page.items;
  switch (result.kind) {
    case "engagement": return {...summary, engagement: {...summary.engagement, events: items as Member360["engagement"]["events"]}};
    case "emails": return {...summary, emails: items as Member360["emails"]};
    case "events": return {...summary, events: items as Member360["events"]};
    case "purchases": return {...summary, purchases: items as Member360["purchases"]};
    case "notes": return {...summary, notes: items as Member360["notes"]};
    case "journeys": return {...summary, journeys: items as Member360["journeys"]};
    case "whatsapp": return {...summary, whatsapp: items as Member360["whatsapp"]};
    case "suppressions": return {...summary, suppressions: items as Member360["suppressions"]};
  }
}

export default async function AdminMember360Page({params, searchParams}: Props) {
  const {locale: localeValue, id} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const rawListState: Record<string, string | string[] | undefined> = searchParams ? await searchParams : {};
  let backHref = adminMemberListHref(locale === "zh-HK" ? "/zh" : "", {search: "", limit: 20, cursor: null});
  try {
    const listInput = Object.fromEntries(retainedListKeys.filter((key) => rawListState[key] !== undefined).map((key) => [key, rawListState[key]]));
    const listState = parseAdminMemberRouteQuery(listInput);
    backHref = adminMemberListHref(locale === "zh-HK" ? "/zh" : "", listState, parseAdminMemberHistory(rawListState.history));
  } catch {
    // Ignore malformed or external return hints; only locally constructed list URLs are used.
  }

  const profileId = profileIdSchema.safeParse(id);
  if (!profileId.success) {
    notFound();
  }

  const t = await getTranslations({locale, namespace: "Admin"});
  const actor = await requireAdminPageActor();
  const rawSection = rawListState.section;
  const parsedSection = rawSection === undefined ? null : memberTimelineKindSchema.safeParse(rawSection);
  if (parsedSection && !parsedSection.success) notFound();
  const activeHistory: MemberTimelineKind | null = parsedSection ? parsedSection.data : null;
  const historyQuery = activeHistory ? parsePageQuery({
    search: typeof rawListState.historyQ === "string" ? rawListState.historyQ : "",
    cursor: typeof rawListState.historyCursor === "string" ? rawListState.historyCursor : null,
    limit: 20,
  }) : null;
  const summary = await adminMembersRepository.getSummary(actor, profileId.data);
  if (!summary) notFound();
  const timeline = activeHistory && historyQuery
    ? await adminMembersRepository.getMemberTimelinePage(actor, profileId.data, activeHistory, historyQuery)
    : null;
  if (activeHistory && !timeline) notFound();
  const view = withTimeline(summary, timeline);
  const memberPath = `${locale === "zh-HK" ? "/zh" : ""}/admin/members/${profileId.data}`;
  const sectionHref = (section: MemberTimelineKind | null, nextCursor?: string | null) => {
    const query = new URLSearchParams();
    for (const key of retainedListKeys) {
      const value = rawListState[key];
      if (typeof value === "string") query.set(key, value);
      if (Array.isArray(value)) for (const item of value) query.append(key, item);
    }
    if (section) query.set("section", section);
    if (section && section === activeHistory && historyQuery?.search) query.set("historyQ", historyQuery.search);
    if (nextCursor) query.set("historyCursor", nextCursor);
    const encoded = query.toString();
    return `${memberPath}${encoded ? `?${encoded}` : ""}`;
  };

  const appendAction = appendMemberNoteAction.bind(null, profileId.data, `/${locale}/admin/members/${profileId.data}`, {
      success: t("member360.noteSuccess"),
      validation: t("member360.noteValidation"),
      error: t("member360.noteError"),
    },
  );
  const editable = await getEditableMemberProfile(actor, profileId.data);
  const membership = view.membership;
  const maintenance=await workQueueRepository.getMemberMaintenance(actor,profileId.data,membership?.id??null).catch(()=>null);
  const customerHref = membership?.stripeCustomerId
    ? `https://dashboard.stripe.com/customers/${encodeURIComponent(membership.stripeCustomerId)}`
    : null;
  const subscriptionHref = membership?.stripeSubscriptionId
    ? `https://dashboard.stripe.com/subscriptions/${encodeURIComponent(membership.stripeSubscriptionId)}`
    : null;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <Link className="inline-flex text-sm text-primary underline focus-visible:outline" href={backHref}>{t("member360.backToMembers")}</Link>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">
          {t("navigation.members")}
        </p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
          {view.profile.displayName}
        </h1>
        <p className="text-lg text-muted-foreground">
          {t("member360.description")}
        </p>
      </header>
      <MemberMaintenanceSummary locale={locale} view={view} maintenance={maintenance} labels={{
       title:t("memberMaintenance.title"),identity:t("memberMaintenance.identity"),linked:t("memberMaintenance.linked"),unknown:t("memberMaintenance.unknown"),membership:t("member360.membership"),renewal:t("member360.renewal"),payment:t("memberMaintenance.payment"),owner:t("workQueue.owner"),next:t("workQueue.nextAction"),none:t("memberMaintenance.none"),unassigned:t("workQueue.unassigned"),unavailable:t("workQueue.unavailable"),
       paymentStates:Object.fromEntries(["active","completed","abandoned","expired"].map(state=>[state,t(`memberMaintenance.paymentStates.${state}`)])),
       membershipStates:Object.fromEntries(["active","past_due","cancel_at_period_end","pending_review","pending_payment","cancelled","expired"].map(state=>[state,t(`members.statusCodes.${state}`)])),
       actions:Object.fromEntries(WORK_ACTIONS.map(action=>[action,t(`workQueue.actions.${action}`)])),
      }}/>
      <nav aria-label={t("member360.historyNav")} className="flex flex-wrap gap-2">
        <a aria-current={activeHistory === null ? "page" : undefined} className="min-h-11 rounded-md border px-4 py-2 aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground" href={sectionHref(null)}>{t("member360.overview")}</a>
        {memberTimelineKindSchema.options.map((section) => <a aria-current={activeHistory === section ? "page" : undefined} className="min-h-11 rounded-md border px-4 py-2 aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground" href={sectionHref(section)} key={section}>{t(`member360.${section}`)}</a>)}
      </nav>
      {activeHistory ? <form action={memberPath} className="flex flex-wrap items-end gap-2" method="get">
        {retainedListKeys.map((key) => typeof rawListState[key] === "string" ? <input key={key} name={key} type="hidden" value={rawListState[key] as string}/> : null)}
        <input name="section" type="hidden" value={activeHistory}/>
        <label className="block text-sm" htmlFor="member-history-search">{t("member360.searchHistory")}<input className="mt-2 block min-h-11 rounded-md border px-3" defaultValue={historyQuery?.search} id="member-history-search" name="historyQ" type="search"/></label>
        <button className="min-h-11 rounded-md border px-4" type="submit">{t("member360.searchSubmit")}</button>
      </form> : null}
      {actor.kind === "superadmin" && process.env.PAYMENT_RECONCILIATION_ENABLED === "true" && membership && ["startup", "corporate"].includes(membership.planCode) ? <PaymentReconciliationForm
        action={reconcileMembershipPaymentAction.bind(null,profileId.data,membership.id,locale)} requestId={randomUUID()}
        labels={{title:t("paymentReconciliation.title"),description:t("paymentReconciliation.description"),event:t("paymentReconciliation.event"),reason:t("paymentReconciliation.reason"),paid:t("paymentReconciliation.paid"),mismatch:t("paymentReconciliation.mismatch"),retry:t("paymentReconciliation.retry"),submit:t("paymentReconciliation.submit"),pending:t("paymentReconciliation.pending"),processed:t("paymentReconciliation.processed"),duplicate:t("paymentReconciliation.duplicate"),error:t("paymentReconciliation.error")}}
      /> : null}
      <Member360View
        activeHistory={activeHistory}
        locale={locale}
        labels={{
          profile: t("member360.profile"),
          companies: t("member360.companies"),
          membership: t("member360.membership"),
          allMemberships: t("member360.allMemberships"),
          membershipId: t("member360.membershipId"),
          personalMembership: t("member360.personalMembership"),
          purchases: t("member360.purchases"),
          purchaseBuyer: t("member360.purchaseBuyer"),
          purchaseAttendees: t("member360.purchaseAttendees"),
          purchaseAmount: t("member360.purchaseAmount"),
          refundReason: t("member360.refundReason"),
          refundedAt: t("member360.refundedAt"),
          planCodes: Object.fromEntries(["community", "startup", "corporate", "patron"].map((code) => [code, t(`members.planCodes.${code}`)])),
          membershipStatuses: Object.fromEntries(["active", "past_due", "cancel_at_period_end", "pending_review", "pending_payment", "cancelled", "expired"].map((code) => [code, t(`members.statusCodes.${code}`)])),
          purchaseStatuses: Object.fromEntries(["pending", "paid", "expired", "failed", "refunded", "refund_failed"].map((code) => [code, t(`member360.purchaseStatuses.${code}`)])),
          refundReasons: Object.fromEntries(["oversold", "staff", "cancelled"].map((code) => [code, t(`member360.refundReasons.${code}`)])),
          engagement: t("member360.engagement"),
          emails: t("member360.emails"),
          events: t("member360.events"),
          notes: t("member360.notes"),
          journeys: t("member360.journeys"),
          whatsapp: t("member360.whatsapp"),
          suppressions: t("member360.suppressions"),
          empty: t("member360.empty"),
          name: t("member360.name"),
          email: t("member360.email"),
          phone: t("member360.phone"),
          role: t("member360.role"),
          plan: t("member360.plan"),
          status: t("member360.status"),
          renewal: t("member360.renewal"),
          score: t("member360.score"),
          trend: t("member360.trend"),
          company: t("member360.company"),
          companyRole: t("member360.companyRole"),
          event: t("member360.event"),
          occurredAt: t("member360.occurredAt"),
          subject: t("member360.subject"),
          emailStatus: t("member360.emailStatus"),
          template: t("member360.template"),
          locale: t("member360.locale"),
          channel: t("member360.channel"),
          classification: t("member360.classification"),
          attemptCount: t("member360.attemptCount"),
          errorCode: t("member360.errorCode"),
          scheduledAt: t("member360.scheduledAt"),
          createdAt: t("member360.createdAt"),
          step: t("member360.step"),
          reasonCode: t("member360.reasonCode"),
          noteAuthor: t("member360.noteAuthor"),
          noteCreatedAt: t("member360.noteCreatedAt"),
          billingDetails:t("memberMaintenance.billingDetails"),
          stripeCustomer: t("member360.stripeCustomer"),
          stripeSubscription: t("member360.stripeSubscription"),
        }}
        ticketResendLabels={process.env.ADMIN_BATCH_ENABLED === "true" && process.env.TICKET_RESEND_BATCH_ENABLED === "true" ? {preview: t("member360.ticketResendPreview"), error: t("member360.ticketResendError")} : undefined}
        stripeCustomerHref={customerHref}
        stripeSubscriptionHref={subscriptionHref}
        view={view}
      />
      {activeHistory && timeline?.page.nextCursor ? <a className="inline-flex min-h-11 items-center text-primary underline" href={sectionHref(activeHistory, timeline.page.nextCursor)}>{t("member360.nextPage")}</a> : null}
      {activeHistory && historyQuery?.cursor ? <a className="text-primary underline" href={sectionHref(activeHistory)}>{t("member360.firstPage")}</a> : null}
      {editable
        ? <MemberProfileForm
          action={updateMemberProfileAction.bind(
            null,
            profileId.data,
            `/${locale}/admin/members/${profileId.data}`,
            {
              successMessage: t("member360.profileSuccess"),
              validationMessage: t("member360.profileValidation"),
              errorMessage: t("member360.profileError"),
            },
          )}
          labels={{
            heading: t("member360.profileHeading"),
            description: t("member360.profileDescription"),
            displayName: t("member360.profileDisplayName"),
            phone: t("member360.profilePhone"),
            jobTitle: t("member360.profileJobTitle"),
            locale: t("member360.profileLocale"),
            locales: {"en": t("member360.profileLocaleEn"), "zh-HK": t("member360.profileLocaleZh")},
            optional: t("member360.profileOptional"),
            save: t("member360.profileSave"),
            saving: t("member360.saving"),
          }}
          values={editable}
        />
        : null}
      <MembershipCompForm labels={{title: t("membershipComp.title"), description: t("membershipComp.description")}}/>
      {actor.kind === "superadmin" && process.env.MEMBERSHIP_GRANTS_ENABLED === "true" ? <MembershipGrantForm
        idempotencyKey={randomUUID()}
        action={grantMembershipAction.bind(null, profileId.data, `/${locale}/admin/members/${profileId.data}`, {
          success: t("membershipGrant.success"), invalid: t("membershipGrant.invalid"), duplicate: t("membershipGrant.duplicate"), conflict: t("membershipGrant.conflict"), error: t("membershipGrant.error"),
        })}
        labels={{title: t("membershipGrant.title"), description: t("membershipGrant.description"), plan: t("membershipGrant.plan"), start: t("membershipGrant.start"), expiry: t("membershipGrant.expiry"), reason: t("membershipGrant.reason"), submit: t("membershipGrant.submit")}}
      /> : null}
      <MemberNoteForm
        action={appendAction}
        labels={{
          title: t("member360.addNote"),
          body: t("member360.noteBody"),
          submit: t("member360.addNote"),
          submitting: t("member360.saving"),
          success: t("member360.noteSuccess"),
          validation: t("member360.noteValidation"),
        }}
      />
    </div>
  );
}

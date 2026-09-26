import {notFound} from "next/navigation";
import Link from "next/link";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {z} from "zod";

import {Member360View} from "@/components/admin/member-360";
import {MemberNoteForm} from "@/components/admin/member-note-form";
import {MemberProfileForm} from "@/components/admin/member-profile-form";
import {MembershipCompForm} from "@/components/admin/membership-comp-form";
import type {AppLocale} from "@/i18n/routing";
import {
  getMember360,
  Member360NotFoundError,
} from "@/lib/admin/member-360";
import {appendMemberNoteAction} from "@/lib/admin/member-note-actions";
import {updateMemberProfileAction} from "@/lib/admin/member-profile-actions";
import {compMembershipAction} from "@/lib/admin/membership-comp-actions";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {getEditableMemberProfile} from "@/lib/db/repos/admin-member-profile";
import {adminMemberListHref, parseAdminMemberHistory, parseAdminMemberRouteQuery} from "@/lib/admin/member-types";

const profileIdSchema = z.string().min(1);

type Props = Readonly<{
  params: Promise<{locale: string; id: string}>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function AdminMember360Page({params, searchParams}: Props) {
  const {locale: localeValue, id} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const rawListState: Record<string, string | string[] | undefined> = searchParams ? await searchParams : {};
  let backHref = adminMemberListHref(locale === "zh-HK" ? "/zh" : "", {search: "", limit: 20, cursor: null});
  try {
    const listState = parseAdminMemberRouteQuery(rawListState);
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
  let view;
  try {
    view = await getMember360(actor, profileId.data);
  } catch (error) {
    if (error instanceof Member360NotFoundError) {
      notFound();
    }
    throw error;
  }

  const appendAction = appendMemberNoteAction.bind(null, profileId.data, `/${locale}/admin/members/${profileId.data}`, {
      success: t("member360.noteSuccess"),
      validation: t("member360.noteValidation"),
      error: t("member360.noteError"),
    },
  );
  const editable = await getEditableMemberProfile(actor, profileId.data);
  const membership = view.membership;
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
      <Member360View
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
          stripeCustomer: t("member360.stripeCustomer"),
          stripeSubscription: t("member360.stripeSubscription"),
        }}
        stripeCustomerHref={customerHref}
        stripeSubscriptionHref={subscriptionHref}
        view={view}
      />
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
      <MembershipCompForm
        action={compMembershipAction.bind(null, `/${locale}/admin/members/${profileId.data}`, {
          successMessage: t("membershipComp.success"),
          validationMessage: t("membershipComp.invalid"),
          errorMessage: t("membershipComp.error"),
          duplicateMessage: t("membershipComp.duplicate"),
        })}
        labels={{
          title: t("membershipComp.title"),
          description: t("membershipComp.description"),
          planLabel: t("membershipComp.planLabel"),
          submit: t("membershipComp.submit"),
        }}
        profileId={profileId.data}
      />
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

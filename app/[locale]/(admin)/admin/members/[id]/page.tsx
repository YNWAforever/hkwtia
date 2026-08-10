import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {z} from "zod";

import {Member360View} from "@/components/admin/member-360";
import {MemberNoteForm} from "@/components/admin/member-note-form";
import {MemberProfileForm} from "@/components/admin/member-profile-form";
import type {AppLocale} from "@/i18n/routing";
import {
  getMember360,
  Member360NotFoundError,
} from "@/lib/admin/member-360";
import {appendMemberNoteAction} from "@/lib/admin/member-note-actions";
import {updateMemberProfileAction} from "@/lib/admin/member-profile-actions";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {getEditableMemberProfile} from "@/lib/db/repos/admin-member-profile";

const profileIdSchema = z.string().min(1);

type Props = Readonly<{
  params: Promise<{locale: string; id: string}>;
}>;

export default async function AdminMember360Page({params}: Props) {
  const {locale: localeValue, id} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);

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

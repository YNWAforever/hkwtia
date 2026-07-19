import {revalidatePath} from "next/cache";
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {z} from "zod";

import {Member360View} from "@/components/admin/member-360";
import {MemberNoteForm} from "@/components/admin/member-note-form";
import type {AppLocale} from "@/i18n/routing";
import {getMember360, Member360NotFoundError} from "@/lib/admin/member-360";
import {createAppendMemberNoteAction} from "@/lib/admin/member-note-action";
import {requireAdminActor} from "@/lib/auth/actor";
import {appendMemberNote} from "@/lib/db/repos/member-notes";

const profileIdSchema = z.string().min(1);
type Props = Readonly<{params: Promise<{locale: string; id: string}>}>;

export default async function AdminMember360Page({params}: Props) {
  const {locale: localeValue, id} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const profileId = profileIdSchema.safeParse(id);
  if (!profileId.success) notFound();
  const t = await getTranslations({locale, namespace: "Admin"});
  let view;
  try { view = await getMember360(await requireAdminActor(), profileId.data); } catch (error) {
    if (error instanceof Member360NotFoundError) notFound();
    throw error;
  }
  const appendAction = createAppendMemberNoteAction({
    profileId: profileId.data,
    path: `/${locale}/admin/members/${profileId.data}`,
    labels: {success: t("member360.noteSuccess"), validation: t("member360.noteValidation"), error: t("member360.noteError")},
    dependencies: {actor: requireAdminActor, append: appendMemberNote, revalidate: revalidatePath},
  });
  const membership = view.membership;
  const customerHref = membership?.stripeCustomerId ? `https://dashboard.stripe.com/customers/${encodeURIComponent(membership.stripeCustomerId)}` : null;
  const subscriptionHref = membership?.stripeSubscriptionId ? `https://dashboard.stripe.com/subscriptions/${encodeURIComponent(membership.stripeSubscriptionId)}` : null;
  return <div className="space-y-8"><header className="space-y-3"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("navigation.members")}</p><h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{view.profile.displayName}</h1><p className="text-lg text-muted-foreground">{t("member360.description")}</p></header><Member360View labels={{profile: t("member360.profile"), companies: t("member360.companies"), membership: t("member360.membership"), engagement: t("member360.engagement"), emails: t("member360.emails"), events: t("member360.events"), notes: t("member360.notes"), empty: t("member360.empty"), name: t("member360.name"), email: t("member360.email"), phone: t("member360.phone"), role: t("member360.role"), plan: t("member360.plan"), status: t("member360.status"), renewal: t("member360.renewal"), score: t("member360.score"), trend: t("member360.trend"), company: t("member360.company"), companyRole: t("member360.companyRole"), event: t("member360.event"), occurredAt: t("member360.occurredAt"), subject: t("member360.subject"), emailStatus: t("member360.emailStatus"), noteAuthor: t("member360.noteAuthor"), noteCreatedAt: t("member360.noteCreatedAt"), stripeCustomer: t("member360.stripeCustomer"), stripeSubscription: t("member360.stripeSubscription")}} stripeCustomerHref={customerHref} stripeSubscriptionHref={subscriptionHref} view={view}/><MemberNoteForm action={appendAction} labels={{title: t("member360.addNote"), body: t("member360.noteBody"), submit: t("member360.addNote"), submitting: t("member360.saving"), success: t("member360.noteSuccess"), validation: t("member360.noteValidation")}}/></div>;
}
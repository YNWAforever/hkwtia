import {randomUUID} from "node:crypto";
import {PrivateLink as Link} from "@/components/internal-shell/private-link";
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {MembershipGrantForm} from "@/components/admin/membership-grant-form";
import type {AppLocale} from "@/i18n/routing";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {prepareMembershipGrantBatchAction} from "@/lib/admin/membership-grant-actions";
import {localizedPath} from "@/lib/urls";

type Props = Readonly<{params: Promise<{locale: string}>}>;
export default async function AdminMembershipGrantsPage({params}: Props) {
  const {locale: value} = await params;
  const locale = value as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  if (actor.kind !== "superadmin") notFound();
  const t = await getTranslations({locale, namespace: "Admin.batchGrants"});
  const enabled = process.env.ADMIN_BATCH_ENABLED === "true" && process.env.MEMBERSHIP_GRANTS_ENABLED === "true" && process.env.MEMBERSHIP_GRANT_BATCH_ENABLED === "true";
  const action = prepareMembershipGrantBatchAction.bind(null, locale, {success: t("success"), invalid: t("invalid"), duplicate: t("duplicate"), error: t("error")});
  return <div className="space-y-4">
    <Link className="text-primary underline" href={localizedPath(locale, "/admin/members")}>{t("back")}</Link>
    <h1 className="font-serif text-4xl font-semibold">{t("title")}</h1>
    {enabled ? <MembershipGrantForm action={action} labels={{title: t("formTitle"), description: t("description"), plan: t("plan"), start: t("start"), expiry: t("expiry"), reason: t("reason"), submit: t("preview")}} batchTargets={{companyAllowed: process.env.MEMBERSHIP_COMPANY_GRANTS_ENABLED === "true", idempotencyKey: randomUUID(), labels: {kind: t("kind"), profile: t("profile"), company: t("company"), ids: t("ids"), help: t("help")}}}/> : <p>{t("disabled")}</p>}
  </div>;
}

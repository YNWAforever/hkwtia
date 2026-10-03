import type {Metadata} from "next";
import {NextIntlClientProvider} from "next-intl";
import {getMessages, getTranslations, setRequestLocale} from "next-intl/server";

import type {ReactNode} from "react";

import {AdminAppShell} from "@/components/admin/admin-app-shell";
import {profileIdentityRepository} from "@/lib/db/repos/profile-identities";
import type {AppLocale} from "@/i18n/routing";
import {requireAdminPageActor} from "@/lib/admin/page-auth";

export const dynamic = "force-dynamic";

// Authenticated surface: never indexed (master plan WP-7 SEO row). Layout metadata merges into
// every page below it, so no page needs its own robots block.
export const metadata: Metadata = {robots: {index: false, follow: false}};

type Props = Readonly<{children: ReactNode; params: Promise<{locale: string}>}>;

export default async function AdminLayout({children, params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const [t, identity, messages] = await Promise.all([
    getTranslations({locale, namespace: "Common"}),
    profileIdentityRepository.getDisplayName(actor.profileId),
    getMessages(),
  ]);
  if (!identity) throw new Error("ADMIN_PROFILE_MISSING");
  return <NextIntlClientProvider messages={messages}><AdminAppShell identity={identity} locale={locale} role={actor.kind} skipLabel={t("skipToContent")}>
    {children}
  </AdminAppShell></NextIntlClientProvider>;
}

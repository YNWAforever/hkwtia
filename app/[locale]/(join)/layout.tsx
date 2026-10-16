import Image from "next/image";
import Link from "next/link";
import {getTranslations} from "next-intl/server";
import type {ReactNode} from "react";

import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";

export default async function JoinLayout({children, params}: {children: ReactNode; params: Promise<{locale: string}>}) {
  const {locale} = await params;
  const [t, tNav] = await Promise.all([
    getTranslations({locale, namespace: "Join"}),
    getTranslations({locale, namespace: "Navigation"}),
  ]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          {/* The same lockup as the public header and sign-in pages: an applicant mid-way through
              joining should still recognise whose form this is. It used to be the bare text "WTIA". */}
          <Link aria-label={tNav("homeLabel")} className="inline-flex min-h-11 items-center gap-3" href={localizedPath(locale as AppLocale, "/")}>
            <Image alt={tNav("logoAlt")} height={36} src="/images/wtia-logo.png" width={100} />
            <span className="hidden text-base font-semibold text-primary sm:inline">{tNav("brand.publicName")}</span>
          </Link>
          <Link className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline" href={localizedPath(locale as AppLocale, "/membership")}>{t("backToMembership")}</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10 sm:py-16">{children}</main>
    </div>
  );
}

import Link from "next/link";
import {getTranslations} from "next-intl/server";
import type {ReactNode} from "react";

import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";

export default async function JoinLayout({children, params}: {children: ReactNode; params: Promise<{locale: string}>}) {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Join"});

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link className="font-serif text-xl font-semibold" href={localizedPath(locale as AppLocale, "/")}>WTIA</Link>
          <Link className="text-sm text-muted-foreground underline-offset-4 hover:underline" href={localizedPath(locale as AppLocale, "/membership")}>{t("backToMembership")}</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10 sm:py-16">{children}</main>
    </div>
  );
}

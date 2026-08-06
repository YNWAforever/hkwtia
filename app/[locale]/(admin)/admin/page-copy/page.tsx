import Link from "next/link";
import {getTranslations, setRequestLocale} from "next-intl/server";

import type {AppLocale} from "@/i18n/routing";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {pageCopyRepository} from "@/lib/db/repos/page-copy";
import {pageCopyCatalogSizes} from "@/lib/i18n/page-copy-catalog";
import {pageCopyNamespaces} from "@/lib/i18n/page-copy-scope";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function AdminPageCopyPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const overrides = await pageCopyRepository.listForAdmin(actor);
  const t = await getTranslations({locale, namespace: "Admin.pageCopy"});
  const sizes = pageCopyCatalogSizes();
  const counts = new Map<string, number>();
  for (const row of overrides) counts.set(row.namespace, (counts.get(row.namespace) ?? 0) + 1);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
        <h1 className="font-serif text-4xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </header>
      <section className="glass-card p-6">
        <h2 className="font-serif text-2xl font-semibold">{t("sectionsTitle")}</h2>
        <ul className="mt-2 divide-y">
          {pageCopyNamespaces.map((namespace) => (
            <li className="flex flex-wrap items-center justify-between gap-2 py-3" key={namespace}>
              <Link className="underline" href={`/${locale}/admin/page-copy/${namespace}`}>
                {t(`namespaces.${namespace}`)}
              </Link>
              <span className="text-sm text-muted-foreground">
                {t("fieldCount", {count: sizes[namespace]})}
                {" · "}
                {t("overrideCount", {count: counts.get(namespace) ?? 0})}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

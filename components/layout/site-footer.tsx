import {getTranslations} from "next-intl/server";

import {DualBrandLockup} from "@/components/layout/dual-brand-lockup";
import {localizeNavigation, type NavigationMessageKey} from "@/config/navigation";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";

const footerTargetClassName = "inline-flex min-h-11 min-w-11 max-w-full items-center break-words underline-offset-4 hover:text-shell-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--shell-focus))]";

export async function SiteFooter({locale}: {locale: AppLocale}) {
  const [navigationT, t] = await Promise.all([
    getTranslations({locale, namespace: "Navigation"}),
    getTranslations({locale, namespace: "Footer"}),
  ]);
  const navigation = localizeNavigation((key: NavigationMessageKey) => navigationT(key));

  return (
    <footer className="border-t border-shell-border bg-shell-warm py-14 text-shell-ink">
      <div className="mx-auto grid max-w-shell gap-10 px-6 lg:grid-cols-[1.2fr_2fr]">
        <div>
          <DualBrandLockup labels={{
            homeLabel: t("brand.homeLabel"),
            publicName: t("brand.publicName"),
            descriptor: t("brand.descriptor"),
            logoAlt: t("brand.logoAlt"),
          }} />
          <p className="mt-5 max-w-md text-sm leading-6 text-shell-muted">{t("summary")}</p>
          <p className="mt-4 text-xs leading-5 text-shell-muted">{t("address")}</p>
        </div>

        <nav aria-label={t("journeys")}>
          <h2 className="sr-only">{t("journeys")}</h2>
          <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
            {navigation.groups.map((group) => (
              <section key={group.id} aria-labelledby={`footer-${group.id}`} className="min-w-0">
                <h3 id={`footer-${group.id}`} className="text-sm font-bold">{group.label}</h3>
                <ul className="mt-3 space-y-2 text-sm text-shell-muted">
                  {group.columns.flatMap((column) => column.links).map((link) => (
                    <li key={link.id} className="min-w-0">
                      <Link className={footerTargetClassName} href={link.href}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </nav>

        <div className="border-t border-shell-border pt-6 lg:col-span-2">
          <div className="flex flex-col gap-5 text-sm sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-bold">{t("connect")}</h2>
              <address className="mt-2 space-y-1 not-italic text-shell-muted">
                <a className={footerTargetClassName} href="mailto:contact@hkwtia.org">contact@hkwtia.org</a>
                <a className={footerTargetClassName} href="tel:+85229899164">+852 2989 9164</a>
              </address>
            </div>
            <div className="text-shell-muted">
              <h2 className="font-bold text-shell-ink">{t("legal")}</h2>
              <Link className={`mt-2 ${footerTargetClassName}`} href="/privacy">{t("privacy")}</Link>
              <p className="mt-2 text-xs">{t("copyright", {year: new Date().getFullYear()})}</p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

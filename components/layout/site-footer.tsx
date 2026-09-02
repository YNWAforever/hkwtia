import {getTranslations} from "next-intl/server";

import {DualBrandLockup} from "@/components/layout/dual-brand-lockup";
import {FooterNewsletter} from "@/components/layout/footer-newsletter";
import {LocaleSwitcher} from "@/components/layout/locale-switcher";
import {
  localizeNavigation,
  type LocalizedNavigationGroup,
  type LocalizedNavigationLink,
  type NavigationGroupId,
  type NavigationMessageKey,
} from "@/config/navigation";
import {siteConfig} from "@/config/site";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";

// hkwtia's own 44px tap-target floor (spec §2.9); the donor's .footer-links a sets type only.
const footerTargetClassName = "inline-flex min-h-11 min-w-11 max-w-full items-center break-words";

/**
 * A column entry is not a `LocalizedNavigationLink`: the Membership column also carries
 * `/join` and `/portal`, and `/portal` is a member route, so it is deliberately absent from
 * `PublicRoute`. Widening the href here rather than widening `PublicRoute` keeps the shell's
 * canonical-destination contract (tests/unit/navigation.test.ts) exactly as narrow as it is.
 */
type FooterLink = Readonly<{id: string; href: string; label: string}>;
type FooterColumn = Readonly<{id: string; label: string; links: readonly FooterLink[]}>;

export async function SiteFooter({locale}: {locale: AppLocale}) {
  const [navigationT, t] = await Promise.all([
    getTranslations({locale, namespace: "Navigation"}),
    getTranslations({locale, namespace: "Footer"}),
  ]);
  const navigation = localizeNavigation((key: NavigationMessageKey) => navigationT(key));
  // A map read through `get`, not a cast over Object.fromEntries: the cast asserts a shape the
  // value may not have, so a renamed group id would reach `.columns` on `undefined` and throw
  // during the render of every public page. Public pages degrade instead — the column loses its
  // links, the page still serves, and public-shell.test.tsx's exact target count still fails in CI.
  const groups: ReadonlyMap<NavigationGroupId, LocalizedNavigationGroup> =
    new Map(navigation.groups.map((group) => [group.id, group] as const));
  const leaves = (id: NavigationGroupId): readonly LocalizedNavigationLink[] =>
    groups.get(id)?.columns.flatMap((column) => column.links) ?? [];
  const addressLines = t.raw("addressLines") as readonly string[];

  // Donor .footer-links (commit f91ecc5 :1030) is four columns, its own set being
  // Explore / Connect / Membership / Contact. Three of that Connect column's five links do have
  // canonical destinations here — /members and /solutions merge into /showcase, /gba into
  // /launchpad and /partner-with-us into /contact (config/wisetech-integration-manifest.ts);
  // only /partners retires. It is unusable for a different reason: reusing it would either
  // repeat /contact in two columns, breaking the every-leaf-appears-once property that
  // tests/unit/public-shell.test.tsx pins through its exact target count, or leave hkwtia's five
  // About leaves with no column at all. hkwtia's fourth grouping is therefore About (errata
  // E-21), and every one of the 16 navigation leaves appears exactly once.
  const columns: readonly FooterColumn[] = [
    {id: "explore", label: t("columns.explore"), links: leaves("events-programmes")},
    {
      id: "membership",
      label: t("columns.membership"),
      links: [
        ...leaves("membership-ecosystem"),
        {id: "join", href: navigation.actions.join.href, label: navigation.actions.join.label},
        {id: "member-sign-in", href: navigation.memberPortal.href, label: navigation.memberPortal.label},
      ],
    },
    {
      id: "about",
      label: t("columns.about"),
      links: [
        ...leaves("about-wtia").filter((link) => link.href !== "/contact"),
        ...leaves("impact-insights"),
      ],
    },
  ];

  const contactLink = leaves("about-wtia").find((link) => link.href === "/contact") ?? null;

  return (
    <footer className="site-footer">
      <div className="shell footer-top">
        <div className="footer-brand">
          <DualBrandLockup labels={{
            homeLabel: t("brand.homeLabel"),
            publicName: t("brand.publicName"),
            descriptor: t("brand.descriptor"),
            logoAlt: t("brand.logoAlt"),
          }} />
          <p>{t("summary")}</p>
          <small>{t("legalLine")}</small>
        </div>
        <FooterNewsletter labels={{
          eyebrow: t("newsletter.eyebrow"),
          title: t("newsletter.title"),
          emailLabel: t("newsletter.emailLabel"),
          placeholder: t("newsletter.placeholder"),
          submit: t("newsletter.submit"),
          success: t("newsletter.success"),
          error: t("newsletter.error"),
          mailSubject: t("newsletter.mailSubject"),
          mailBody: t.raw("newsletter.mailBody") as string,
        }} />
      </div>

      <div className="shell footer-links">
        {columns.map((column) => (
          <div key={column.id}>
            <strong>{column.label}</strong>
            {column.links.map((link) => (
              <Link className={footerTargetClassName} key={link.id} href={link.href}>
                {link.label}
              </Link>
            ))}
          </div>
        ))}
        <div>
          <strong>{t("columns.contact")}</strong>
          {contactLink === null ? null : (
            <Link className={footerTargetClassName} href={contactLink.href}>{contactLink.label}</Link>
          )}
          <a className={footerTargetClassName} href={`mailto:${siteConfig.contact.email}`}>
            {siteConfig.contact.email}
          </a>
          {siteConfig.contact.phone === undefined ? null : (
            <a className={footerTargetClassName} href={`tel:${siteConfig.contact.phone.replace(/\s/g, "")}`}>
              {siteConfig.contact.phone}
            </a>
          )}
          <address>
            {addressLines.map((line, index) => (
              <span key={index}>
                {line}
                {index === addressLines.length - 1 ? null : <br />}
              </span>
            ))}
          </address>
        </div>
      </div>

      <div className="shell footer-bottom">
        <strong>{t("tagline")}</strong>
        <div>
          <Link className={footerTargetClassName} href="/privacy">{t("privacy")}</Link>
          {/* Terms and Accessibility are `retire` in the manifest until WP-7 reviews copy for
              them; the donor's bottom row links both. The donor carries no copyright line at
              all — hkwtia keeps one, because a legal notice is worth more than that much
              fidelity (errata E-22). */}
          <small>{t("copyright", {year: new Date().getFullYear()})}</small>
          <LocaleSwitcher
            locale={locale}
            englishLabel={navigationT("english")}
            chineseLabel={navigationT("chinese")}
            switchToEnglishLabel={navigationT("switchToEnglish")}
            switchToChineseLabel={navigationT("switchToChinese")}
          />
        </div>
      </div>
    </footer>
  );
}

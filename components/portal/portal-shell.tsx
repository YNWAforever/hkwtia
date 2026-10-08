import type {ReactNode} from "react";

import {DualBrandLockup, type DualBrandLockupLabels} from "@/components/layout/dual-brand-lockup";
import {LocaleSwitcher} from "@/components/layout/locale-switcher";
import {PortalSignOutButton} from "@/components/portal/portal-sign-out-button";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";

export type PortalShellLabels = Readonly<{
  portalLabel: string;
  backToSite: string;
  signOut: string;
  signOutError: string;
  /** The Navigation-namespace locale labels, the same copy the public header's switcher shows. */
  switcher: Readonly<{english: string; chinese: string; switchToEnglish: string; switchToChinese: string}>;
}>;

/**
 * The member portal frame, in the public site's WiseTech design. Like InternalAppShell it owns
 * the skip link and the page's only main#main-content, so a portal page can never render a
 * second landmark. A Server Component: the interactive pieces (navigation sheet, locale
 * switcher, sign-out) are the client islands it composes.
 */
export function PortalShell({
  locale,
  skipLabel,
  brand,
  labels,
  navigation,
  children,
}: Readonly<{
  locale: AppLocale;
  skipLabel: string;
  brand: DualBrandLockupLabels;
  labels: PortalShellLabels;
  navigation: ReactNode;
  children: ReactNode;
}>) {
  return (
    <div className="portal-root">
      <a href="#main-content" className="portal-skip-link">{skipLabel}</a>
      <header className="portal-header">
        <DualBrandLockup labels={brand} />
        <span className="portal-header-label">{labels.portalLabel}</span>
        <div className="portal-header-actions">
          <LocaleSwitcher
            className="language-link"
            locale={locale}
            englishLabel={labels.switcher.english}
            chineseLabel={labels.switcher.chinese}
            switchToEnglishLabel={labels.switcher.switchToEnglish}
            switchToChineseLabel={labels.switcher.switchToChinese}
          />
          <Link className="portal-header-link" href="/">{labels.backToSite}</Link>
          <PortalSignOutButton label={labels.signOut} errorLabel={labels.signOutError} />
        </div>
      </header>
      <div className="portal-frame">
        {navigation}
        <main id="main-content" className="portal-main">{children}</main>
      </div>
    </div>
  );
}

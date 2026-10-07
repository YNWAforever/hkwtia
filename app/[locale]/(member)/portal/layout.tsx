import type {Metadata} from "next";
import {NextIntlClientProvider} from "next-intl";
import {getMessages, getTranslations, setRequestLocale} from "next-intl/server";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import type {ReactNode} from "react";

// Same order as app/[locale]/(public)/layout.tsx: the port, its shell overrides, the experience
// layer, then the portal's own frame, so every equal-specificity tie goes to the later file.
import "../../../styles/wisetech.css";
import "../../../styles/wisetech-shell.css";
import "../../../styles/wisetech-experience.css";
import "../../../styles/wisetech-portal.css";

import {ConciergeWidget} from "@/components/ai/concierge-widget";
import {PortalNavigation, type PortalNavGroup} from "@/components/portal/portal-navigation";
import {PortalShell} from "@/components/portal/portal-shell";
import {portalNavigationGroups} from "@/config/internal-navigation";
import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {isAdminActor} from "@/lib/auth/authorize";
import {localizeConcierge} from "@/lib/ai/concierge-labels";
import {publicEnv} from "@/lib/config/env";
import {parsePortalContinuation} from "@/lib/portal/continuation";
import {localizedPath} from "@/lib/urls";

// The Portal copy key behind each configured link id; the `satisfies` keeps it in step with
// config/internal-navigation.ts, so a new link cannot ship without a label.
type PortalNavLinkId = (typeof portalNavigationGroups)[number]["links"][number]["id"];
const linkLabelKeys = {
  dashboard: "dashboard",
  profile: "profile",
  company: "company",
  "showcase-listing": "showcaseListing.nav",
  seats: "seats.title",
  directory: "directory.title",
  events: "events.title",
  documents: "documents.title",
  tools: "tools.title",
  billing: "billing.title",
} satisfies Record<PortalNavLinkId, string>;

export const dynamic = "force-dynamic";

// Authenticated surface: never indexed (master plan WP-7 SEO row). Layout metadata merges into
// every page below it, so no page needs its own robots block.
export const metadata: Metadata = {robots: {index: false, follow: false}};

type Props = Readonly<{children: ReactNode; params: Promise<{locale: string}>}>;

/** Build the dedicated member sign-in redirect for an unauthenticated Portal visitor. */
function memberLoginPath(locale: AppLocale, continuation: string): string {
  const query = new URLSearchParams({next: continuation});
  return `${localizedPath(locale, "/member-login")}?${query.toString()}`;
}

export default async function PortalLayout({children, params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);

  let actor;
  try {
    actor = await requireActor();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      const requestHeaders = await headers();
      const continuation = parsePortalContinuation(requestHeaders.get("next-url") ?? requestHeaders.get("x-invoke-path"));
      redirect(memberLoginPath(locale, continuation));
    }
    throw error;
  }
  // Without this, an admin actor would still pay for the member shell's build --
  // the translation calls, localizeConcierge, and constructing
  // PortalShell/PortalNavigation/ConciergeWidget -- before page.tsx's own guard
  // ever ran. It also means this layout doesn't rely solely on that sibling
  // file to keep an admin from flashing member-portal chrome.
  if (isAdminActor(actor)) redirect(localizedPath(locale, "/admin"));

  const [concierge, commonT, portalT, navigationT, messages] = await Promise.all([
    getTranslations({locale, namespace: "Concierge"}),
    getTranslations({locale, namespace: "Common"}),
    getTranslations({locale, namespace: "Portal"}),
    getTranslations({locale, namespace: "Navigation"}),
    getMessages(),
  ]);
  const conciergeLabels = localizeConcierge((key) => concierge.raw(key));
  const {turnstileSiteKey} = publicEnv();
  const groups: readonly PortalNavGroup[] = portalNavigationGroups.map((group) => ({
    id: group.id,
    label: portalT(`navGroups.${group.id}`),
    links: group.links.map((link) => ({
      id: link.id,
      href: localizedPath(locale, link.href),
      label: portalT(linkLabelKeys[link.id]),
    })),
  }));

  return (
    <NextIntlClientProvider messages={messages}>
      <PortalShell
        locale={locale}
        skipLabel={commonT("skipToContent")}
        brand={{
          homeLabel: navigationT("homeLabel"),
          publicName: navigationT("brand.publicName"),
          descriptor: navigationT("brand.descriptor"),
          logoAlt: navigationT("logoAlt"),
        }}
        labels={{
          portalLabel: portalT("shell.portalLabel"),
          backToSite: portalT("shell.backToSite"),
          signOut: portalT("signOut"),
          signOutError: portalT("signOutError"),
          switcher: {
            english: navigationT("english"),
            chinese: navigationT("chinese"),
            switchToEnglish: navigationT("switchToEnglish"),
            switchToChinese: navigationT("switchToChinese"),
          },
        }}
        navigation={
          <PortalNavigation
            groups={groups}
            labels={{navigationLabel: portalT("navigation"), openMenu: commonT("openMenu"), closeMenu: commonT("closeMenu")}}
          />
        }
      >
        {children}
      </PortalShell>
      <ConciergeWidget
        locale={locale}
        labels={conciergeLabels}
        {...(turnstileSiteKey === undefined ? {} : {turnstileSiteKey})}
      />
    </NextIntlClientProvider>
  );
}

"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {useTranslations} from "next-intl";

import {portalNavigationGroups} from "@/config/internal-navigation";
import {InternalNavigation, type InternalNavGroup} from "@/components/internal-shell/navigation";
import {PortalSignOutButton} from "@/components/portal/portal-sign-out-button";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

/** The real link ids configured for the portal nav — kept in sync with linkLabelKeys via `satisfies`. */
type PortalNavLinkId = (typeof portalNavigationGroups)[number]["links"][number]["id"];

/** Maps each config link id to the Portal message key that resolves its nav label. */
const linkLabelKeys = {
  dashboard: "dashboard",
  profile: "profile",
  company: "company",
  "showcase-listing": "showcaseListing.nav",
  directory: "directory.title",
  events: "events.title",
  documents: "documents.title",
  billing: "billing.title",
} satisfies Record<PortalNavLinkId, string>;

export function PortalNav({locale}: Readonly<{locale: AppLocale}>) {
  const pathname = usePathname();
  const t = useTranslations("Portal");
  const tCommon = useTranslations("Common");

  const groups: readonly InternalNavGroup[] = portalNavigationGroups.map((group) => ({
    id: group.id,
    links: group.links.map((link) => ({
      id: link.id,
      href: localizedPath(locale, link.href),
      label: t(linkLabelKeys[link.id]),
    })),
  }));

  return (
    <div>
      <header className="mx-auto flex max-w-6xl items-center px-4 pt-4 sm:px-6">
        <Link className="font-serif text-xl font-semibold text-foreground" href={localizedPath(locale, "/portal")}>
          WTIA
        </Link>
      </header>
      <InternalNavigation
        groups={groups}
        labels={{navigationLabel: t("navigation"), openMenu: tCommon("openMenu"), closeMenu: tCommon("closeMenu")}}
        currentPath={pathname}
      >
        <PortalSignOutButton label={t("signOut")} errorLabel={t("signOutError")} />
      </InternalNavigation>
    </div>
  );
}

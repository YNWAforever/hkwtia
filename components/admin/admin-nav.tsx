"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {useTranslations} from "next-intl";

import {adminNavigationGroups} from "@/config/internal-navigation";
import {InternalNavigation, type InternalNavGroup} from "@/components/internal-shell/navigation";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

/** The real link ids configured for the admin nav — kept in sync with linkLabelKeys via `satisfies`. */
type AdminNavLinkId = (typeof adminNavigationGroups)[number]["links"][number]["id"];

/** Maps each config link id to the Admin.navigation message key that resolves its nav label. */
const linkLabelKeys = {
  dashboard: "navigation.dashboard",
  members: "navigation.members",
  "at-risk": "navigation.atRisk",
  inbox: "navigation.inbox",
  contacts: "navigation.contacts",
  tasks: "navigation.tasks",
  segments: "navigation.segments",
  announcements: "navigation.announcements",
  news: "navigation.news",
  "page-copy": "navigation.pageCopy",
  media: "navigation.media",
  partners: "navigation.partners",
  "landing-partners": "navigation.landingPartners",
  events: "navigation.events",
  listings: "navigation.listingsReview",
  "profiles-review": "navigation.profilesReview",
  cohorts: "navigation.cohorts",
  approvals: "navigation.approvals",
  reports: "navigation.reports",
  automations: "navigation.automations",
  templates: "navigation.templates",
} satisfies Record<AdminNavLinkId, string>;

export function AdminNav({locale}: Readonly<{locale: AppLocale}>) {
  const pathname = usePathname();
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");

  const groups: readonly InternalNavGroup[] = adminNavigationGroups.map((group) => ({
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
        <Link className="font-serif text-xl font-semibold text-foreground" href={localizedPath(locale, "/admin")}>
          {t("brand")}
        </Link>
      </header>
      <InternalNavigation
        groups={groups}
        labels={{navigationLabel: t("navigation.label"), openMenu: tCommon("openMenu"), closeMenu: tCommon("closeMenu")}}
        currentPath={pathname}
      />
    </div>
  );
}

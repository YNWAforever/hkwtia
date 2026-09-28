"use client";

import {usePathname} from "next/navigation";
import {useTranslations} from "next-intl";

import {adminNavigationGroups} from "@/config/internal-navigation";
import {findCurrentLink, type InternalNavGroup} from "@/components/internal-shell/navigation";
import {GuardedAdminLink} from "@/components/admin/unsaved-changes-guard";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

/** The real link ids configured for the admin nav — kept in sync with linkLabelKeys via `satisfies`. */
type AdminNavLinkId = (typeof adminNavigationGroups)[number]["links"][number]["id"];
type AdminNavGroupId = (typeof adminNavigationGroups)[number]["id"];
export const groupLabelKeys = {
  workspace: "navigation.groups.workspace",
  "members-organizations": "navigation.groups.membersOrganizations",
  events: "navigation.groups.events",
  "communications-follow-up": "navigation.groups.communicationsFollowUp",
  "content-settings": "navigation.groups.contentSettings",
} satisfies Record<AdminNavGroupId, string>;

/** Maps each config link id to the Admin.navigation message key that resolves its nav label. */
export const linkLabelKeys = {
  dashboard: "navigation.dashboard",
  members: "navigation.members",
  batches: "navigation.batches",
  "at-risk": "navigation.atRisk",
  inbox: "navigation.inbox",
  contacts: "navigation.contacts",
  tasks: "navigation.tasks",
  segments: "navigation.segments",
  campaigns: "navigation.campaigns",
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

export function AdminNav({locale, collapsed = false, onNavigate, showBrand = true}: Readonly<{
  locale: AppLocale; collapsed?: boolean; onNavigate?: () => void; showBrand?: boolean;
}>) {
  const pathname = usePathname();
  const t = useTranslations("Admin");

  const groups: readonly InternalNavGroup[] = adminNavigationGroups.map((group) => ({
    id: group.id,
    label: t(groupLabelKeys[group.id]),
    links: group.links.map((link) => ({id: link.id, href: localizedPath(locale, link.href), label: t(linkLabelKeys[link.id])})),
  }));
  const current = findCurrentLink(groups, pathname);
  return <div className="flex h-full min-h-0 flex-col">
    {showBrand ? <GuardedAdminLink className="flex min-h-16 items-center border-b px-4 font-serif text-xl font-semibold text-foreground" href={localizedPath(locale, "/admin")}>{collapsed ? t("brandShort") : t("brand")}</GuardedAdminLink> : null}
    <nav aria-label={t("navigation.label")} className="space-y-5 overflow-y-auto px-3 py-5">
      {groups.map(group => <div className="space-y-1" key={group.id}>
        {!collapsed ? <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p> : null}
        {group.links.map(link => <GuardedAdminLink
          aria-current={link.href === current ? "page" : undefined}
          aria-label={collapsed ? link.label : undefined}
          className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-primary aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary"
          href={link.href} key={link.id} onNavigate={onNavigate}
          title={collapsed ? link.label : undefined}
        >
          <span aria-hidden="true" className="mr-3 inline-flex size-5 shrink-0 items-center justify-center rounded border border-current text-[10px]">{link.label.slice(0, 1)}</span>
          {!collapsed ? <span>{link.label}</span> : null}
        </GuardedAdminLink>)}
      </div>)}
    </nav>
  </div>;
}

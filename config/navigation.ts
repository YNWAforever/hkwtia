import type {PublicRoute} from "@/config/public-routes";

export type NavigationGroupId = "events-programmes" | "membership-ecosystem" | "impact-insights" | "about-wtia";
export type NavigationMessageKey =
  | "groups.eventsProgrammes.label" | "groups.eventsProgrammes.description"
  | "groups.membershipEcosystem.label" | "groups.membershipEcosystem.description"
  | "groups.impactInsights.label" | "groups.impactInsights.description"
  | "groups.aboutWtia.label" | "groups.aboutWtia.description"
  | "columns.participate" | "columns.programmes" | "columns.membership" | "columns.insights" | "columns.organisation" | "columns.connect"
  | "links.events" | "links.launchpad" | "links.hkict" | "links.asa" | "links.tct" | "links.cpai" | "links.membership" | "links.showcase" | "links.news" | "links.aiOps" | "links.aiTransparency" | "links.about" | "links.history" | "links.chairman" | "links.committees" | "links.contact"
  | "actions.findEvent" | "actions.join" | "actions.memberSignIn";

export type NavigationLink = Readonly<{id: string; href: PublicRoute; labelKey: NavigationMessageKey}>;
export type NavigationColumn = Readonly<{id: string; labelKey: NavigationMessageKey; links: readonly NavigationLink[]}>;
export type NavigationGroup = Readonly<{id: NavigationGroupId; landingHref: PublicRoute; eventFirst: boolean; labelKey: NavigationMessageKey; descriptionKey: NavigationMessageKey; columns: readonly NavigationColumn[]}>;
export type LocalizedNavigationLink = Readonly<{id: string; href: PublicRoute; label: string}>;
export type LocalizedNavigationGroup = Readonly<{id: NavigationGroupId; landingHref: PublicRoute; eventFirst: boolean; label: string; description: string; columns: readonly Readonly<{id: string; label: string; links: readonly LocalizedNavigationLink[]}>[]}>;
type PublicShellAction = Readonly<{id: "find-event" | "join-wisetech"; href: PublicRoute; labelKey: NavigationMessageKey; priority: "primary" | "secondary"}>;

export const navigationGroups = [
  {id: "events-programmes", landingHref: "/events", eventFirst: true, labelKey: "groups.eventsProgrammes.label", descriptionKey: "groups.eventsProgrammes.description", columns: [
    {id: "participate", labelKey: "columns.participate", links: [{id: "events", href: "/events", labelKey: "links.events"}, {id: "launchpad", href: "/launchpad", labelKey: "links.launchpad"}]},
    {id: "programmes", labelKey: "columns.programmes", links: [{id: "hkict", href: "/programs/hkict", labelKey: "links.hkict"}, {id: "asa", href: "/programs/asa", labelKey: "links.asa"}, {id: "tct", href: "/programs/tct", labelKey: "links.tct"}, {id: "cpai", href: "/programs/cpai", labelKey: "links.cpai"}]},
  ]},
  {id: "membership-ecosystem", landingHref: "/membership", eventFirst: false, labelKey: "groups.membershipEcosystem.label", descriptionKey: "groups.membershipEcosystem.description", columns: [{id: "membership", labelKey: "columns.membership", links: [{id: "membership", href: "/membership", labelKey: "links.membership"}, {id: "showcase", href: "/showcase", labelKey: "links.showcase"}]}]},
  {id: "impact-insights", landingHref: "/news", eventFirst: false, labelKey: "groups.impactInsights.label", descriptionKey: "groups.impactInsights.description", columns: [{id: "insights", labelKey: "columns.insights", links: [{id: "news", href: "/news", labelKey: "links.news"}, {id: "ai-ops", href: "/ai-ops", labelKey: "links.aiOps"}, {id: "ai-transparency", href: "/ai-transparency", labelKey: "links.aiTransparency"}]}]},
  {id: "about-wtia", landingHref: "/about", eventFirst: false, labelKey: "groups.aboutWtia.label", descriptionKey: "groups.aboutWtia.description", columns: [
    {id: "organisation", labelKey: "columns.organisation", links: [{id: "about", href: "/about", labelKey: "links.about"}, {id: "history", href: "/about/history", labelKey: "links.history"}, {id: "chairman", href: "/about/chairman", labelKey: "links.chairman"}, {id: "committees", href: "/about/committees", labelKey: "links.committees"}]},
    {id: "connect", labelKey: "columns.connect", links: [{id: "contact", href: "/contact", labelKey: "links.contact"}]},
  ]},
] as const satisfies readonly NavigationGroup[];

export const publicShellActions = Object.freeze({
  findEvent: Object.freeze({id: "find-event", href: "/events", labelKey: "actions.findEvent", priority: "primary"} satisfies PublicShellAction),
  join: Object.freeze({id: "join-wisetech", href: "/join", labelKey: "actions.join", priority: "secondary"} satisfies PublicShellAction),
});
export const memberPortalAction = Object.freeze({id: "member-sign-in", href: "/portal" as const, labelKey: "actions.memberSignIn" as const});
export type NavigationViewModel = Readonly<{
  groups: readonly LocalizedNavigationGroup[];
  actions: Readonly<{findEvent: Readonly<Omit<(typeof publicShellActions)["findEvent"], "labelKey"> & {label: string}>; join: Readonly<Omit<(typeof publicShellActions)["join"], "labelKey"> & {label: string}>}>;
  memberPortal: Readonly<Omit<typeof memberPortalAction, "labelKey"> & {label: string}>;
}>;

export function localizeNavigation(translate: (key: NavigationMessageKey) => string): NavigationViewModel {
  return {
    groups: navigationGroups.map((group) => ({id: group.id, landingHref: group.landingHref, eventFirst: group.eventFirst, label: translate(group.labelKey), description: translate(group.descriptionKey), columns: group.columns.map((column) => ({id: column.id, label: translate(column.labelKey), links: column.links.map((link) => ({id: link.id, href: link.href, label: translate(link.labelKey)}))}))})),
    actions: {
      findEvent: {id: publicShellActions.findEvent.id, href: publicShellActions.findEvent.href, priority: publicShellActions.findEvent.priority, label: translate(publicShellActions.findEvent.labelKey)},
      join: {id: publicShellActions.join.id, href: publicShellActions.join.href, priority: publicShellActions.join.priority, label: translate(publicShellActions.join.labelKey)},
    },
    memberPortal: {id: memberPortalAction.id, href: memberPortalAction.href, label: translate(memberPortalAction.labelKey)},
  };
}
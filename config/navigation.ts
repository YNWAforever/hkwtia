import type {PublicRoute} from "@/config/public-routes";

export type NavigationGroupId = "events-programmes" | "membership-ecosystem" | "impact-insights" | "about-wtia";
export type NavigationMessageKey =
  | "groups.eventsProgrammes.label" | "groups.eventsProgrammes.description"
  | "groups.membershipEcosystem.label" | "groups.membershipEcosystem.description"
  | "groups.impactInsights.label" | "groups.impactInsights.description"
  | "groups.aboutWtia.label" | "groups.aboutWtia.description"
  | "feature.eventsProgrammes.label" | "feature.eventsProgrammes.title" | "feature.eventsProgrammes.copy" | "feature.eventsProgrammes.cta"
  | "feature.membershipEcosystem.label" | "feature.membershipEcosystem.title" | "feature.membershipEcosystem.copy" | "feature.membershipEcosystem.cta"
  | "feature.impactInsights.label" | "feature.impactInsights.title" | "feature.impactInsights.copy" | "feature.impactInsights.cta"
  | "feature.aboutWtia.label" | "feature.aboutWtia.title" | "feature.aboutWtia.copy" | "feature.aboutWtia.cta"
  | "columns.participate" | "columns.programmes" | "columns.membership" | "columns.insights" | "columns.organisation" | "columns.connect"
  | "links.events" | "links.launchpad" | "links.hkict" | "links.asa" | "links.tct" | "links.cpai" | "links.membership" | "links.showcase" | "links.news" | "links.aiOps" | "links.aiTransparency" | "links.about" | "links.history" | "links.chairman" | "links.committees" | "links.contact"
  | "actions.findEvent" | "actions.join" | "actions.memberSignIn";

export type NavigationLink = Readonly<{id: string; href: PublicRoute; labelKey: NavigationMessageKey}>;
export type NavigationColumn = Readonly<{id: string; labelKey: NavigationMessageKey; links: readonly NavigationLink[]}>;
/**
 * The donor's `.mega-feature-v2` aside (app/megaNav.ts `feature`). Its href is a
 * `PublicRoute` because the shell may only point at canonical hkwtia destinations —
 * tests/unit/wisetech-shell-boundary.test.ts rejects the donor's own paths.
 */
export type NavigationFeature = Readonly<{
  labelKey: NavigationMessageKey;
  titleKey: NavigationMessageKey;
  copyKey: NavigationMessageKey;
  ctaKey: NavigationMessageKey;
  href: PublicRoute;
}>;
export type NavigationGroup = Readonly<{id: NavigationGroupId; landingHref: PublicRoute; eventFirst: boolean; labelKey: NavigationMessageKey; descriptionKey: NavigationMessageKey; feature: NavigationFeature; columns: readonly NavigationColumn[]}>;
export type LocalizedNavigationLink = Readonly<{id: string; href: PublicRoute; label: string}>;
export type LocalizedNavigationFeature = Readonly<{label: string; title: string; copy: string; cta: string; href: PublicRoute}>;
export type LocalizedNavigationGroup = Readonly<{id: NavigationGroupId; landingHref: PublicRoute; eventFirst: boolean; label: string; description: string; feature: LocalizedNavigationFeature; columns: readonly Readonly<{id: string; label: string; links: readonly LocalizedNavigationLink[]}>[]}>;
type PublicShellAction = Readonly<{id: "find-event" | "join-wisetech"; href: PublicRoute; labelKey: NavigationMessageKey; priority: "primary" | "secondary"}>;

export const navigationGroups = [
  {id: "events-programmes", landingHref: "/events", eventFirst: true, labelKey: "groups.eventsProgrammes.label", descriptionKey: "groups.eventsProgrammes.description",
    feature: {labelKey: "feature.eventsProgrammes.label", titleKey: "feature.eventsProgrammes.title", copyKey: "feature.eventsProgrammes.copy", ctaKey: "feature.eventsProgrammes.cta", href: "/events"}, columns: [
    {id: "participate", labelKey: "columns.participate", links: [{id: "events", href: "/events", labelKey: "links.events"}, {id: "launchpad", href: "/launchpad", labelKey: "links.launchpad"}]},
    {id: "programmes", labelKey: "columns.programmes", links: [{id: "hkict", href: "/programs/hkict", labelKey: "links.hkict"}, {id: "asa", href: "/programs/asa", labelKey: "links.asa"}, {id: "tct", href: "/programs/tct", labelKey: "links.tct"}, {id: "cpai", href: "/programs/cpai", labelKey: "links.cpai"}]},
  ]},
  {id: "membership-ecosystem", landingHref: "/membership", eventFirst: false, labelKey: "groups.membershipEcosystem.label", descriptionKey: "groups.membershipEcosystem.description",
    feature: {labelKey: "feature.membershipEcosystem.label", titleKey: "feature.membershipEcosystem.title", copyKey: "feature.membershipEcosystem.copy", ctaKey: "feature.membershipEcosystem.cta", href: "/contact"}, columns: [{id: "membership", labelKey: "columns.membership", links: [{id: "membership", href: "/membership", labelKey: "links.membership"}, {id: "showcase", href: "/showcase", labelKey: "links.showcase"}]}]},
  // The cta reads "AI transparency" / "人工智能透明度", not the donor's "Responsible AI" / "負責任 AI": the href is /ai-transparency, and the donor's /responsible-ai is a merge-only route (config/wisetech-integration-manifest.ts), so the label names the real destination.
  {id: "impact-insights", landingHref: "/news", eventFirst: false, labelKey: "groups.impactInsights.label", descriptionKey: "groups.impactInsights.description",
    feature: {labelKey: "feature.impactInsights.label", titleKey: "feature.impactInsights.title", copyKey: "feature.impactInsights.copy", ctaKey: "feature.impactInsights.cta", href: "/ai-transparency"}, columns: [{id: "insights", labelKey: "columns.insights", links: [{id: "news", href: "/news", labelKey: "links.news"}, {id: "ai-ops", href: "/ai-ops", labelKey: "links.aiOps"}, {id: "ai-transparency", href: "/ai-transparency", labelKey: "links.aiTransparency"}]}]},
  {id: "about-wtia", landingHref: "/about", eventFirst: false, labelKey: "groups.aboutWtia.label", descriptionKey: "groups.aboutWtia.description",
    feature: {labelKey: "feature.aboutWtia.label", titleKey: "feature.aboutWtia.title", copyKey: "feature.aboutWtia.copy", ctaKey: "feature.aboutWtia.cta", href: "/about/history"}, columns: [
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
    groups: navigationGroups.map((group) => ({
      id: group.id,
      landingHref: group.landingHref,
      eventFirst: group.eventFirst,
      label: translate(group.labelKey),
      description: translate(group.descriptionKey),
      feature: {
        label: translate(group.feature.labelKey),
        title: translate(group.feature.titleKey),
        copy: translate(group.feature.copyKey),
        cta: translate(group.feature.ctaKey),
        href: group.feature.href,
      },
      columns: group.columns.map((column) => ({id: column.id, label: translate(column.labelKey), links: column.links.map((link) => ({id: link.id, href: link.href, label: translate(link.labelKey)}))})),
    })),
    actions: {
      findEvent: {id: publicShellActions.findEvent.id, href: publicShellActions.findEvent.href, priority: publicShellActions.findEvent.priority, label: translate(publicShellActions.findEvent.labelKey)},
      join: {id: publicShellActions.join.id, href: publicShellActions.join.href, priority: publicShellActions.join.priority, label: translate(publicShellActions.join.labelKey)},
    },
    memberPortal: {id: memberPortalAction.id, href: memberPortalAction.href, label: translate(memberPortalAction.labelKey)},
  };
}
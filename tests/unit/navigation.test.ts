import {describe, expect, it} from "vitest";

import {
  localizeNavigation,
  memberPortalAction,
  navigationGroups,
  publicShellActions,
} from "@/config/navigation";
import {publicRoutes} from "@/config/public-routes";
import {wisetechIntegrationManifest} from "@/config/wisetech-integration-manifest";

const groupShape = navigationGroups.map((group) => ({
  id: group.id,
  landingHref: group.landingHref,
  eventFirst: group.eventFirst,
  links: group.columns.flatMap((column) => column.links.map(({href}) => href)),
}));

describe("public shell navigation", () => {
  it("uses the approved group order, landing routes, and unique leaf ownership", () => {
    expect(groupShape).toEqual([
      {id: "events-programmes", landingHref: "/events", eventFirst: true, links: ["/events", "/launchpad", "/programs/hkict", "/programs/asa", "/programs/tct", "/programs/cpai"]},
      {id: "membership-ecosystem", landingHref: "/membership", eventFirst: false, links: ["/membership", "/showcase"]},
      {id: "impact-insights", landingHref: "/news", eventFirst: false, links: ["/news", "/ai-ops", "/ai-transparency"]},
      {id: "about-wtia", landingHref: "/about", eventFirst: false, links: ["/about", "/about/history", "/about/chairman", "/about/committees", "/contact"]},
    ]);
    const leaves = groupShape.flatMap(({links}) => links);
    expect(new Set(leaves).size).toBe(leaves.length);
  });

  it("keeps every public destination canonical and retained", () => {
    const retained = new Set(wisetechIntegrationManifest.filter(({kind, disposition}) => kind === "route" && disposition === "retain").map(({canonicalPath}) => canonicalPath));
    const destinations = [
      ...groupShape.flatMap(({links}) => links),
      ...navigationGroups.map((group) => group.feature.href),
      publicShellActions.findEvent.href,
      publicShellActions.join.href,
    ];
    for (const href of destinations) {
      expect(publicRoutes, href).toContain(href);
      expect(retained.has(href), href).toBe(true);
    }
  });

  it("keeps global actions separate and the protected utility explicit", () => {
    expect(publicShellActions).toEqual({
      findEvent: {id: "find-event", href: "/events", labelKey: "actions.findEvent", priority: "primary"},
      join: {id: "join-wisetech", href: "/join", labelKey: "actions.join", priority: "secondary"},
    });
    expect(memberPortalAction).toEqual({id: "member-sign-in", href: "/portal", labelKey: "actions.memberSignIn"});
    expect(publicRoutes).not.toContain("/portal" as never);
    expect(wisetechIntegrationManifest.find(({id}) => id === "route-portal")).toEqual(expect.objectContaining({canonicalPath: "/portal", disposition: "retain"}));
  });

  it("localizes one serializable model without adding visible strings to config", () => {
    const view = localizeNavigation((key) => `translated:${key}`);
    expect(view.groups[0]?.label).toBe("translated:groups.eventsProgrammes.label");
    expect(view.groups[0]?.columns[1]?.links[0]?.label).toBe("translated:links.hkict");
    expect(view.actions.findEvent.label).toBe("translated:actions.findEvent");
    expect(view.memberPortal.label).toBe("translated:actions.memberSignIn");
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });
});
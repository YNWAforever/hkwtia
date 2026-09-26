import {describe, expect, it} from "vitest";

import {resolveProductionLhciTarget} from "../../scripts/resolve-production-lhci-target.mjs";

const alias = "https://hkwtia.vercel.app";
const domain = "https://hkwtia.org";

function sitemap(origin: string, paths = ["/", "/zh"]): string {
  return "<urlset>" + paths.map((path) =>
    '<url><loc>' + origin + path + '</loc><xhtml:link href="' + origin + '/zh"/></url>',
  ).join("") + "</urlset>";
}

function responses(entries: Record<string, Response>) {
  const visited: string[] = [];
  const fetchStub = async (input: string, options: {redirect: string}) => {
    expect(options.redirect).toBe("manual");
    visited.push(input);
    const response = entries[input];
    if (!response) throw new Error("UNEXPECTED_FETCH:" + input);
    return response;
  };
  return {fetchStub, visited};
}

describe("production Lighthouse target", () => {
  it("uses the production alias while its sitemap is canonical there", async () => {
    const {fetchStub, visited} = responses({
      [alias + "/sitemap.xml"]: new Response(sitemap(alias), {status: 200}),
    });
    await expect(resolveProductionLhciTarget(fetchStub)).resolves.toBe(alias);
    expect(visited).toEqual([alias + "/sitemap.xml"]);
  });

  it("uses the new domain only after an exact 308 and verified sitemap", async () => {
    const {fetchStub, visited} = responses({
      [alias + "/sitemap.xml"]: new Response(null, {status: 308, headers: {location: domain + "/sitemap.xml"}}),
      [domain + "/sitemap.xml"]: new Response(sitemap(domain), {status: 200}),
    });
    await expect(resolveProductionLhciTarget(fetchStub)).resolves.toBe(domain);
    expect(visited).toEqual([alias + "/sitemap.xml", domain + "/sitemap.xml"]);
  });

  it("rejects a lookalike redirect without fetching it", async () => {
    const {fetchStub, visited} = responses({
      [alias + "/sitemap.xml"]: new Response(null, {status: 308, headers: {location: domain + ".evil.example/sitemap.xml"}}),
    });
    await expect(resolveProductionLhciTarget(fetchStub)).rejects.toThrow(/redirect/i);
    expect(visited).toEqual([alias + "/sitemap.xml"]);
  });

  it("rejects a temporary redirect", async () => {
    const {fetchStub} = responses({
      [alias + "/sitemap.xml"]: new Response(null, {status: 302, headers: {location: domain + "/sitemap.xml"}}),
    });
    await expect(resolveProductionLhciTarget(fetchStub)).rejects.toThrow(/status/i);
  });

  it("rejects an empty sitemap", async () => {
    const {fetchStub} = responses({
      [alias + "/sitemap.xml"]: new Response("<urlset/>", {status: 200}),
    });
    await expect(resolveProductionLhciTarget(fetchStub)).rejects.toThrow(/empty|loc/i);
  });

  it("rejects a mixed-host alternate in the sitemap", async () => {
    const mixed = sitemap(alias).replace(alias + "/zh", domain + "/zh");
    const {fetchStub} = responses({
      [alias + "/sitemap.xml"]: new Response(mixed, {status: 200}),
    });
    await expect(resolveProductionLhciTarget(fetchStub)).rejects.toThrow(/origin/i);
  });

  it("rejects a mixed-host loc in the sitemap", async () => {
    const mixed = sitemap(alias).replace("<loc>" + alias + "/zh", "<loc>" + domain + "/zh");
    const {fetchStub} = responses({
      [alias + "/sitemap.xml"]: new Response(mixed, {status: 200}),
    });
    await expect(resolveProductionLhciTarget(fetchStub)).rejects.toThrow(/origin/i);
  });

  it("rejects a sitemap missing a locale root", async () => {
    const {fetchStub} = responses({
      [alias + "/sitemap.xml"]: new Response(sitemap(alias, ["/"]), {status: 200}),
    });
    await expect(resolveProductionLhciTarget(fetchStub)).rejects.toThrow("PRODUCTION_SITEMAP_MISSING_ZH_ROOT");
  });

  it("rejects an unverified post-cutover destination", async () => {
    const {fetchStub} = responses({
      [alias + "/sitemap.xml"]: new Response(null, {status: 308, headers: {location: domain + "/sitemap.xml"}}),
      [domain + "/sitemap.xml"]: new Response("unavailable", {status: 503}),
    });
    await expect(resolveProductionLhciTarget(fetchStub)).rejects.toThrow(/status/i);
  });
});

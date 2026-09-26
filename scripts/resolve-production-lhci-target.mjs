#!/usr/bin/env node
import {appendFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const ALIAS = "https://hkwtia.vercel.app";
const DOMAIN = "https://hkwtia.org";
const SITEMAP_PATH = "/sitemap.xml";

function verifySitemap(xml, canonical) {
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  if (locs.length === 0) throw new Error("PRODUCTION_SITEMAP_EMPTY");

  for (const value of locs) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("PRODUCTION_SITEMAP_INVALID_LOC");
    }
    if (url.origin !== canonical) throw new Error("PRODUCTION_SITEMAP_WRONG_ORIGIN");
  }

  for (const root of ["/", "/zh"]) {
    if (!locs.some((value) => new URL(value).pathname === root)) {
      throw new Error("PRODUCTION_SITEMAP_MISSING_" + (root === "/" ? "EN" : "ZH") + "_ROOT");
    }
  }

  const alternates = [...xml.matchAll(/\bhref="([^"]+)"/g)].map((match) => match[1]);
  for (const value of alternates) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("PRODUCTION_SITEMAP_INVALID_ALTERNATE");
    }
    if (url.origin !== canonical) throw new Error("PRODUCTION_SITEMAP_WRONG_ORIGIN");
  }
}

export async function resolveProductionLhciTarget(fetchImpl = fetch) {
  const aliasResponse = await fetchImpl(ALIAS + SITEMAP_PATH, {redirect: "manual"});
  let canonical;
  let sitemapResponse;

  if (aliasResponse.status === 200) {
    canonical = ALIAS;
    sitemapResponse = aliasResponse;
  } else if (aliasResponse.status === 308) {
    const location = aliasResponse.headers.get("location");
    let redirect;
    try {
      redirect = new URL(location ?? "", ALIAS).href;
    } catch {
      throw new Error("PRODUCTION_SITEMAP_UNEXPECTED_REDIRECT");
    }
    if (redirect !== DOMAIN + SITEMAP_PATH) {
      throw new Error("PRODUCTION_SITEMAP_UNEXPECTED_REDIRECT");
    }
    canonical = DOMAIN;
    sitemapResponse = await fetchImpl(redirect, {redirect: "manual"});
  } else {
    throw new Error("PRODUCTION_SITEMAP_UNEXPECTED_STATUS");
  }

  if (sitemapResponse.status !== 200) {
    throw new Error("PRODUCTION_SITEMAP_UNEXPECTED_STATUS");
  }
  verifySitemap(await sitemapResponse.text(), canonical);
  return canonical;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const baseUrl = await resolveProductionLhciTarget();
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, "base_url=" + baseUrl + "\n", "utf8");
    }
    console.log(baseUrl);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "PRODUCTION_LHCI_TARGET_FAILED");
    process.exitCode = 1;
  }
}

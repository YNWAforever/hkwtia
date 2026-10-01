import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import {parseSegmentPageQuery} from "@/lib/admin/segment-pagination";

const actionPath = resolve(process.cwd(), "lib/admin/campaign-actions.ts");
const pagePath = resolve(process.cwd(), "app/[locale]/(admin)/admin/segments/page.tsx");
const componentPath = resolve(process.cwd(), "components/admin/segment-results.tsx");

describe("campaign queue Server Action boundary", () => {
  it("exports the mutation from a top-level use server module", () => {
    expect(existsSync(actionPath)).toBe(true);
    const source = readFileSync(actionPath, "utf8");
    expect(source.trimStart()).toMatch(/^"use server";/);
    expect(source).toMatch(/export async function queueCampaignAction\(/);
    expect(source).not.toMatch(/export (?:const|let|type|interface|function) /);
    expect(source).toContain('import {notFound} from "next/navigation";');
    expect(source).toContain("if (isAuthorizationDenial(error)) notFound();");
    expect(source).toContain("throw error;");
  });

  it("removes legacy mutation from the page and carries validated draft context into the reviewed wizard", () => {
    const page = readFileSync(pagePath, "utf8");
    const component = readFileSync(componentPath, "utf8");
    expect(page).not.toContain('import {queueCampaignAction}');
    expect(page).toContain('campaignBasePath={localizedPath(locale, "/admin/campaigns")} campaignDraft={draft.draftId}');
    expect(page).not.toMatch(/queueCampaignAction\.bind/);
    expect(page).not.toContain('formData.get("idempotencyKey")');
    expect(page).not.toMatch(/async function queueAction[\s\S]*?"use server"/);
    expect(component).not.toMatch(/name=["']idempotencyKey["']/);
  });
  it("excludes draft navigation metadata from strict audience filters and rejects injected authority", () => {
    const parsed = parseSegmentPageQuery({campaignDraft: "00000000-0000-4000-8000-000000001003", sector: "Synthetic", profileId: ["synthetic-a", "synthetic-b"]});
    expect(parsed.query.filter).toMatchObject({sector: "Synthetic", profileIds: ["synthetic-a", "synthetic-b"]});
    expect(parsed.query).not.toHaveProperty("campaignDraft");
    expect(() => parseSegmentPageQuery({sector: "Synthetic", idempotencyKey: "forged"})).toThrow();
    expect(() => parseSegmentPageQuery({sector: "Synthetic", actor: "superadmin"})).toThrow();
  });

});

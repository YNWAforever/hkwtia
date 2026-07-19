import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";

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

  it("binds the validated URL draft on the server and never trusts a form idempotency key", () => {
    const page = readFileSync(pagePath, "utf8");
    const component = readFileSync(componentPath, "utf8");
    expect(page).toContain('import {queueCampaignAction} from "@/lib/admin/campaign-actions";');
    expect(page).toMatch(/queueCampaignAction\.bind\(null, draft\.draftId, localizedPath\(locale, "\/admin\/segments"\)\)/);
    expect(page).not.toContain('formData.get("idempotencyKey")');
    expect(page).not.toMatch(/async function queueAction[\s\S]*?"use server"/);
    expect(page).toContain("const segmentSearchParams = {...rawSearchParams};");
    expect(page).toContain("delete segmentSearchParams.campaignDraft;");
    expect(page).toContain("parseSegmentRouteQuery(segmentSearchParams)");
    expect(component).not.toMatch(/name=["']idempotencyKey["']/);
  });
});

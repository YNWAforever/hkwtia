import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";

const actionSource = () => readFileSync(resolve(process.cwd(), "lib/admin/member-note-actions.ts"), "utf8");
const pageSource = () => readFileSync(resolve(process.cwd(), "app/[locale]/(admin)/admin/members/[id]/page.tsx"), "utf8");

describe("member note Server Action boundary", () => {
  it("exports the page-bound note mutation from a module-level use server boundary", () => {
    const source = actionSource();

    expect(source.trimStart()).toMatch(/^"use server";/);
    expect(source).toMatch(/export async function appendMemberNoteAction\(/);
    expect(source).not.toMatch(/export (?:const|let|type|interface|function) /);
  });

  it("imports and binds the genuine Server Action to the validated route profile", () => {
    const source = pageSource();

    expect(source).toContain('import {appendMemberNoteAction} from "@/lib/admin/member-note-actions";');
    expect(source).toMatch(/appendMemberNoteAction\.bind\(null, profileId\.data, `\/\$\{locale\}\/admin\/members\/\$\{profileId\.data\}`/);
    expect(source).not.toContain("createAppendMemberNoteAction");
  });
});
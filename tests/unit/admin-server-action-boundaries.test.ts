import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";

describe("admin mutation Server Action boundaries", () => {
  it.each([
    ["segment", "lib/admin/segment-actions.ts"],
    ["event", "lib/admin/event-actions.ts"],
    ["member note", "lib/admin/member-note-actions.ts"],
    ["announcement", "lib/admin/announcement-actions.ts"],
    ["news", "lib/admin/news-actions.ts"],
    ["page copy", "lib/admin/page-copy-actions.ts"],
    ["media", "lib/admin/media-actions.ts"],
    // C-2. This list is hand-maintained, so omitting a module does not fail CI —
    // it just leaves it uncovered. The inbox is the one action module that sends
    // messages to members, so it is the last one that should be missing here.
    ["inbox", "lib/admin/inbox-actions.ts"],
  ])("maps authorization denial to notFound in the top-level %s action module", (_name, path) => {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");
    expect(source.trimStart()).toMatch(/^"use server";/);
    expect(source).toContain("isAuthorizationDenial");
    expect(source).toContain("notFound()");
  });
});

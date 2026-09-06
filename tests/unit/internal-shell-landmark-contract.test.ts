import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";

describe("Portal/Admin layouts delegate the sole main landmark to InternalAppShell", () => {
  it.each([
    "app/[locale]/(member)/portal/layout.tsx",
    "app/[locale]/(admin)/admin/layout.tsx",
  ])("renders no literal <main> of its own in %s", (file) => {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    expect(source, file).not.toMatch(/<main[\s>]/);
    expect(source, file).toContain("InternalAppShell");
  });
});

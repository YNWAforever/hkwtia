import {readdirSync, readFileSync, statSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

/**
 * Chrome reports `action="mailto:…"` on an HTTPS page as mixed content
 * ("Allowed with warning"). The old footer newsletter form was that shape, and
 * `form-action 'self'` then blocked the submit. A mailto control has to be an
 * anchor. This walks the rendered tree's sources so a new form cannot sneak back.
 */
function filesUnder(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return /\.(tsx|jsx)$/.test(name) ? [path] : [];
  });
}

export function mailtoFormActionTags(source: string): string[] {
  return (source.match(/<form\b[^>]*>/g) ?? []).filter((tag) =>
    /action\s*=\s*(?:["']mailto:|\{[`'"]mailto:|\{mailto\b)/.test(tag),
  );
}

describe("mailto form actions", () => {
  it("finds none in app or components", () => {
    const offenders = [...filesUnder("app"), ...filesUnder("components")].flatMap((path) =>
      mailtoFormActionTags(readFileSync(path, "utf8")).map((tag) => `${path}: ${tag}`),
    );
    expect(offenders).toEqual([]);
    expect(filesUnder("components").length).toBeGreaterThan(40);
  });

  it("detects the shapes it is meant to catch", () => {
    expect(mailtoFormActionTags(`<form action="mailto:a@b.c"></form>`)).toHaveLength(1);
    expect(mailtoFormActionTags(`<form action={\`mailto:a@b.c\`}></form>`)).toHaveLength(1);
    expect(mailtoFormActionTags(`<form\n  action={mailto}\n></form>`)).toHaveLength(1);
    expect(mailtoFormActionTags(`<a href="mailto:a@b.c">a@b.c</a>`)).toEqual([]);
    expect(mailtoFormActionTags(`<form action={formAction}></form>`)).toEqual([]);
  });
});

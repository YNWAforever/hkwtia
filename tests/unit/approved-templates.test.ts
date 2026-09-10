import {readdirSync, readFileSync} from "node:fs";
import {join, relative, resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {WHATSAPP_TEMPLATES, type WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import {approvedTemplateKeys, CONCIERGE_FOLLOW_UP_TEMPLATE_KEYS} from "@/lib/whatsapp/approved-templates";

/**
 * C1 Task 8 Step 0. Two properties, and the second one is the interesting one.
 *
 * The first: the allowlist behaves off the live switch exactly as the private
 * function in `lib/ai/woztell-production.ts` did, so no non-live test changes
 * meaning when that function is deleted.
 *
 * The second: the picker and the `TEMPLATE_NOT_APPROVED` gate read the SAME
 * function, and C2 Task 2 turns it `async` when the source becomes the
 * `whatsapp_templates` registry. An unawaited `Promise<ReadonlySet<…>>` used as
 * a `Set` answers `has(…) === false` for every key with no type error when it is
 * spread through `Array.from`, which is a picker that silently offers nothing
 * and a gate that silently refuses everything. So the call sites are pinned by
 * name here rather than counted, because a list tells the C2 implementer WHICH
 * files to await and a number only tells them they missed one.
 */
const callSites = ["app", "lib"] as const;
const DEFINING_MODULE = "lib/whatsapp/approved-templates.ts";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
    return entry.isFile() && (path.endsWith(".ts") || path.endsWith(".tsx")) ? [path] : [];
  });
}

/**
 * A bare call, never `deps.approvedTemplateKeys()` or the property in a
 * dependency bag: the lookbehind drops anything preceded by a dot, a word
 * character or a `$`. `lib/admin/inbox-action-core.ts` contains both shapes —
 * the module function once, the injected dependency once — and only the first
 * becomes an `await` in C2.
 *
 * Deliberately not `/g`: a global regex carries `lastIndex` between `.test()`
 * calls, so it would match every other file and the assertion would pass on a
 * list it never really checked.
 */
const BARE_CALL = /(?<![\w.$])approvedTemplateKeys\s*\(/;

/** `NodeJS.ProcessEnv` requires `NODE_ENV`, so build one rather than cast one. */
function environment(values: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv {
  return {NODE_ENV: "test", ...values};
}

describe("approvedTemplateKeys", () => {
  it("offers every configured key when the live switch is off", () => {
    const keys = approvedTemplateKeys(environment());
    expect([...keys].sort()).toEqual(Object.keys(WHATSAPP_TEMPLATES).sort());
    // The mock adapter answers with a `mock:` provider id, so nothing leaves the
    // building and there is nothing to be approved against (D-4).
    expect(keys.has("renewal_14")).toBe(true);
  });

  it("intersects the operator allowlist with the config when the live switch is on", () => {
    const keys = approvedTemplateKeys(environment({
      RUN_LIVE_WOZTELL: "1",
      // The trailing spaces and the unknown key are the point: an operator types
      // this into a Vercel environment variable by hand.
      WOZTELL_APPROVED_TEMPLATE_KEYS: "renewal_14, concierge_follow_up_en ,not_a_template",
    }));
    expect([...keys].sort()).toEqual(["concierge_follow_up_en", "renewal_14"]);
  });

  it("refuses everything when the live switch is on and nothing is listed", () => {
    expect([...approvedTemplateKeys(environment({RUN_LIVE_WOZTELL: "1"}))]).toEqual([]);
  });

  it("keeps the concierge fallback set to the two follow-ups and inside the config", () => {
    expect([...CONCIERGE_FOLLOW_UP_TEMPLATE_KEYS].sort())
      .toEqual(["concierge_follow_up_en", "concierge_follow_up_zh_hk"]);
    for (const key of CONCIERGE_FOLLOW_UP_TEMPLATE_KEYS) {
      expect(Object.hasOwn(WHATSAPP_TEMPLATES, key), key).toBe(true);
    }
    // The picker widens to five; what the concierge may send unattended does not.
    const unattended = [...approvedTemplateKeys(environment())]
      .filter((key: WhatsAppTemplateKey) => CONCIERGE_FOLLOW_UP_TEMPLATE_KEYS.has(key));
    expect(unattended.sort()).toEqual(["concierge_follow_up_en", "concierge_follow_up_zh_hk"]);
  });

  it("is called from exactly these places, so C2 Task 2's await cannot miss one", () => {
    const found = callSites
      .flatMap((root) => sourceFiles(resolve(process.cwd(), root)))
      .map((path) => relative(process.cwd(), path).replaceAll("\\", "/"))
      .filter((path) => path !== DEFINING_MODULE)
      .filter((path) => BARE_CALL.test(readFileSync(resolve(process.cwd(), path), "utf8")))
      .sort();
    expect(found).toEqual([
      // The staff template picker (C1 Task 8 Step 5).
      "app/[locale]/(admin)/admin/inbox/[id]/page.tsx",
      // The TEMPLATE_NOT_APPROVED gate (C1 Task 7).
      "lib/admin/inbox-action-core.ts",
      // The concierge's unattended fallback (C1 Task 8 Step 0).
      "lib/ai/woztell-production.ts",
    ]);
  });
});

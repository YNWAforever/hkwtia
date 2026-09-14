import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import nextConfig from "@/next.config";
import {memberToolOrigins} from "@/config/member-tools";

async function contentSecurityPolicy(): Promise<string> {
  const rules = (await nextConfig.headers?.()) ?? [];
  const header = rules
    .flatMap((rule) => rule.headers)
    .find(({key}) => key === "Content-Security-Policy");
  return header?.value ?? "";
}

function frameSrcDirective(value: string): string | undefined {
  return value.split(";").map((part) => part.trim()).find((part) => part.startsWith("frame-src "));
}

function frameSrcOrigins(value: string): string[] {
  const directive = frameSrcDirective(value);
  return directive
    ? directive.slice("frame-src ".length).split(/\s+/).filter(Boolean)
    : [];
}

/**
 * The concierge widget (mounted on every public and portal page) loads the Turnstile
 * challenge from this origin. Discovery mirrors `server-action-actor-boundary.test.ts`:
 * read the widget's own source for the URL it actually loads rather than restating the
 * host here, so a future CSP edit cannot silently drop an origin the widget needs.
 */
const CONCIERGE_WIDGET_SOURCE = readFileSync(
  resolve(process.cwd(), "components/ai/concierge-widget.tsx"),
  "utf8",
);

function turnstileOriginsInWidget(source: string): string[] {
  return [
    ...new Set(
      [...source.matchAll(/https:\/\/challenges\.cloudflare\.com\/[^"'`\s)]*/g)]
        .map(([url]) => new URL(url).origin),
    ),
  ];
}

describe("member tools CSP", () => {
  it("permits framing of the configured tool origins", async () => {
    expect(memberToolOrigins.length).toBeGreaterThan(0);
    expect(frameSrcOrigins(await contentSecurityPolicy())).toEqual(
      expect.arrayContaining([...memberToolOrigins]),
    );
  });

  it("permits framing of the concierge's Turnstile challenge origin", async () => {
    const widgetOrigins = turnstileOriginsInWidget(CONCIERGE_WIDGET_SOURCE);
    // Vacuous-pass guard: a broken regex or a moved script URL must fail here, not
    // silently assert nothing.
    expect(widgetOrigins.length).toBeGreaterThan(0);

    const declared = frameSrcOrigins(await contentSecurityPolicy());
    // `frame-src` is the only framed-origin allowlist. The challenge iframe the widget
    // loads from challenges.cloudflare.com is refused unless its origin is named here,
    // which silently disables the concierge site-wide (production requires Turnstile).
    expect(declared).toEqual(expect.arrayContaining(widgetOrigins));
  });

  it("still refuses to be framed itself", async () => {
    // What stops a contributor "fixing" frame-src by removing frame-ancestors, which is
    // what makes the admin approve/publish forms clickjackable.
    expect(await contentSecurityPolicy()).toContain("frame-ancestors 'none'");
  });
});

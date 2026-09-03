import {render, screen, within, fireEvent} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

/**
 * `route` steers the shared pathname the footer's client island reads during render, and
 * `rawOverrides` replaces one `t.raw` value with a shape the bundles do not carry. Both are
 * hoisted so the `vi.mock` factories below — which run before this module's own body — can
 * close over them; a value captured at module load could not be changed between two renders
 * of the same mounted tree, which is exactly what a soft navigation is.
 */
const {route, rawOverrides} = vi.hoisted(() => ({
  route: {pathname: "/"},
  rawOverrides: new Map<string, unknown>(),
}));

vi.mock("next-intl/server", async () => {
  const {readFileSync} = await import("node:fs");
  const {resolve} = await import("node:path");
  const bundles = {
    en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
    "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
  } as const;
  const read = (locale: "en" | "zh-HK", namespace: string, key: string) =>
    key.split(".").reduce<unknown>(
      (current, segment) => (current as Record<string, unknown>)[segment],
      (bundles[locale] as Record<string, unknown>)[namespace],
    );
  return {
    getTranslations: async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
      Object.assign(
        (key: string, values?: Record<string, string | number>) =>
          Object.entries(values ?? {}).reduce(
            (text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)),
            String(read(locale, namespace, key)),
          ),
        {
          raw: (key: string) => rawOverrides.has(`${namespace}.${key}`)
            ? rawOverrides.get(`${namespace}.${key}`)
            : read(locale, namespace, key),
        },
      ),
  };
});
vi.mock("next/image", () => ({
  default: ({priority: _priority, ...props}: React.ImgHTMLAttributes<HTMLImageElement> & {priority?: boolean}) => <img {...props} />,
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({replace: vi.fn()}),
  Link: ({href, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) => <a href={href} {...props} />,
}));
vi.mock("next/navigation", () => ({useSearchParams: () => new URLSearchParams()}));

import {SiteFooter} from "@/components/layout/site-footer";
import {siteConfig} from "@/config/site";

const assign = vi.fn();

beforeEach(() => {
  assign.mockReset();
  route.pathname = "/";
  rawOverrides.clear();
  vi.spyOn(window, "location", "get").mockReturnValue({...window.location, assign} as unknown as Location);
});
afterEach(() => vi.restoreAllMocks());

/** The newsletter block, addressed the way a reader reaches it. */
async function renderFooter() {
  const view = render(await SiteFooter({locale: "en"}));
  const footer = screen.getByRole("contentinfo");
  const input = within(footer).getByLabelText("Work email");
  return {
    view,
    // A soft navigation re-renders the persistent layout; it does not remount it. Awaiting the
    // server component again is what makes each pass a fresh element: React bails out of
    // re-rendering a subtree whose element is referentially identical to the last one, so
    // rerender(sameElement) would assert nothing (tests/unit/concierge-shell.test.tsx:80-82).
    navigateTo: async (pathname: string) => {
      route.pathname = pathname;
      view.rerender(await SiteFooter({locale: "en"}));
    },
    footer,
    input,
    form: input.closest("form")!,
    // Both live regions are queried before any submit: a region the reader's software only
    // meets at the moment its text arrives is a region that may never announce it.
    status: within(footer).getByRole("status"),
    alert: within(footer).getByRole("alert"),
    submit: () => fireEvent.click(within(footer).getByRole("button", {name: "Prepare activity-update email"})),
    type: (value: string) => fireEvent.change(input, {target: {value}}),
  };
}

describe("SiteFooter", () => {
  it("renders four donor columns, the address and the bottom row", async () => {
    render(await SiteFooter({locale: "en"}));
    const footer = screen.getByRole("contentinfo");

    const columns = footer.querySelectorAll(".footer-links > div");
    expect(columns).toHaveLength(4);
    expect([...columns].map((column) => column.querySelector("strong")?.textContent)).toEqual([
      "Explore", "Membership", "About", "Contact",
    ]);

    const address = footer.querySelector("address")!;
    for (const line of siteConfig.contact.addressLines) expect(address.textContent).toContain(line);
    expect(within(footer).getByRole("link", {name: siteConfig.contact.email}))
      .toHaveAttribute("href", `mailto:${siteConfig.contact.email}`);
    expect(footer.querySelector('a[href^="tel:"]')).toBeNull();
    expect(siteConfig.contact.phone).toBeUndefined();

    expect(within(footer).getByText("Technology + Wisdom. Hong Kong + The World.")).toBeInTheDocument();
    expect(within(footer).getByRole("link", {name: "Privacy statement"})).toHaveAttribute("href", "/privacy");
    expect(within(footer).getByRole("button", {name: "Switch to Chinese"})).toBeInTheDocument();
    expect(within(footer).queryByRole("link", {name: /terms|accessibility/i})).toBeNull();
    expect(footer.querySelector(".footer-bottom small")?.textContent)
      .toContain(`© ${new Date().getFullYear()} WiseTech Hong Kong.`);
  });

  /**
   * The unset phone is a decision, not an oversight (see config/site.ts), so no shipped input
   * reaches the `tel:` branch and the assertion above would pass just as happily against a
   * footer that could never render one. Setting the number on the shared record for a single
   * render is what makes that assertion mean something — and it pins the space-stripping the
   * href needs, which the rendered label deliberately keeps.
   */
  it("renders the tel: line once a phone is configured", async () => {
    const contact = siteConfig.contact as {phone?: string};
    contact.phone = "+852 2989 9164";
    try {
      render(await SiteFooter({locale: "en"}));
      expect(within(screen.getByRole("contentinfo")).getByRole("link", {name: "+852 2989 9164"}))
        .toHaveAttribute("href", "tel:+85229899164");
    } finally {
      delete contact.phone;
    }
  });

  it("prepares an email instead of subscribing, and reports both outcomes", async () => {
    const {footer, input, form, status, alert, submit, type} = await renderFooter();

    type("not-an-email");
    submit();
    expect(alert).toHaveTextContent("Enter a valid work email.");
    expect(assign).not.toHaveBeenCalled();

    type("reader@example.com");
    submit();
    expect(status).toHaveTextContent("This page does not create a subscription automatically.");
    expect(assign).toHaveBeenCalledTimes(1);
    const target = assign.mock.calls[0]![0] as string;
    expect(target.startsWith(`mailto:${siteConfig.contact.email}?`)).toBe(true);
    expect(decodeURIComponent(target)).toContain("reader@example.com");
    expect(alert).toBeEmptyDOMElement();

    // The success panel replaces the form visually, but the button the reader just activated
    // must not vanish out from under the focus ring: the form stays in the tree and focus is
    // moved somewhere it can be read (WCAG 2.4.3).
    expect(footer.contains(form)).toBe(true);
    expect(form).toHaveAttribute("hidden");
    expect(status).toHaveFocus();
    expect(input.closest("form")).toBe(form);
  });

  /**
   * Submitting the same wrong address twice must say so twice. React batches the reset and the
   * re-flag into one commit, so the alert's words are identical across both attempts; only a
   * replaced child node is a mutation the live region can observe.
   */
  it("re-announces when the same invalid address is submitted again", async () => {
    const {alert, submit, type} = await renderFooter();

    type("not-an-email");
    submit();
    const firstAnnouncement = alert.firstElementChild;
    expect(firstAnnouncement).not.toBeNull();
    expect(alert).toHaveTextContent("Enter a valid work email.");

    submit();
    expect(alert.firstElementChild).not.toBe(firstAnnouncement);
    expect(alert).toHaveTextContent("Enter a valid work email.");
  });

  it.each([
    ["@", false],
    ["@@", false],
    [" @ ", false],
    ["a@b", false],
    ["reader@example.co", true],
  ])("treats %s as a usable address: %s", async (value, accepted) => {
    const {alert, submit, type} = await renderFooter();

    type(value);
    submit();
    expect(assign).toHaveBeenCalledTimes(accepted ? 1 : 0);
    expect(alert).toHaveTextContent(accepted ? "" : "Enter a valid work email.");
  });

  it("links the validation message to the field only while it is showing", async () => {
    const {input, alert, submit, type} = await renderFooter();

    expect(input).not.toHaveAttribute("aria-describedby");
    expect(input).toHaveAttribute("aria-invalid", "false");

    type("not-an-email");
    submit();
    expect(alert.id).not.toBe("");
    expect(input).toHaveAttribute("aria-describedby", alert.id);
    expect(input).toHaveAttribute("aria-invalid", "true");

    type("reader@example.com");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  /** `$&`, `` $` `` and friends are replacement patterns; a typed address must stay literal. */
  it("keeps a $ pattern in the address out of the replacement", async () => {
    const {submit, type} = await renderFooter();

    type("a$&b@example.com");
    submit();
    const body = decodeURIComponent(assign.mock.calls[0]![0] as string);
    expect(body).toContain("a$&b@example.com");
    expect(body).not.toContain("{email}");
  });

  /**
   * The form's own no-script route is inert, not working: `next.config.ts:41` sends
   * `form-action 'self'` on `/:path*` (:153), and a `mailto:` action matches no source in that
   * list, so the browser refuses the submission — no navigation, no query string. The link is
   * therefore the route that functions, with and without script, and it carries the subject
   * the blocked form could never deliver. Navigation is not what `form-action` governs, and
   * this partial policy declares no `default-src`, so nothing constrains following it.
   */
  it("offers a working mail route that does not depend on the script", async () => {
    const {footer, form, submit, type} = await renderFooter();

    const fallback = within(footer).getByRole("link", {name: "Prepare activity-update email"});
    expect(fallback).toHaveAttribute(
      "href",
      `mailto:${siteConfig.contact.email}?subject=${encodeURIComponent("WiseTech activity updates")}`,
    );

    // Still offered after a successful handoff: the success panel replaces the form, and a
    // reader whose mail client never opened would otherwise be left with no route at all.
    type("reader@example.com");
    submit();
    expect(form).toHaveAttribute("hidden");
    expect(within(footer).getByRole("link", {name: "Prepare activity-update email"})).toBe(fallback);

    // Deleting the inert action is not a tidy-up: a form with no action submits to its own URL,
    // which `form-action 'self'` permits, so a no-script submit would reload the public page
    // with the reader's address in the query string — the class of leak next.config.ts:134-135
    // calls load-bearing. Pin the scheme, not the string: the guard is about the origin.
    expect(form.getAttribute("action")).toMatch(/^mailto:/);
  });

  /**
   * `t.raw` is untyped by construction, and this footer renders on every public route, so a
   * bundle where `addressLines` is missing or reshaped used to throw during the render of the
   * whole public site. CLAUDE.md's rule for public pages is to degrade, not to 500: the address
   * block goes, the rest of the footer serves.
   */
  it.each([
    ["missing", undefined],
    ["a bare string", "4/F, KOHO"],
    ["an object", {street: "4/F, KOHO"}],
    ["an array holding a non-string", ["4/F, KOHO", 73]],
    ["an array holding a blank line", ["4/F, KOHO", "   "]],
  ])("renders no address block when addressLines is %s", async (_shape, value) => {
    rawOverrides.set("Footer.addressLines", value);
    render(await SiteFooter({locale: "en"}));
    const footer = screen.getByRole("contentinfo");

    expect(footer.querySelector("address")).toBeNull();
    // Degraded, not broken: the column that owns the address still carries its other contacts.
    expect(within(footer).getByRole("link", {name: siteConfig.contact.email}))
      .toHaveAttribute("href", `mailto:${siteConfig.contact.email}`);
    expect(within(footer).getByText("Technology + Wisdom. Hong Kong + The World.")).toBeInTheDocument();
  });

  /**
   * The island is mounted by app/[locale]/(public)/layout.tsx, which survives every in-app
   * navigation, so a success panel held in state hid the form on every other public page for
   * the rest of the session. Resetting on the route makes the persistent island behave like
   * the per-page form a reader takes it for — the same defect the Concierge fixed by reading
   * the route during render (components/ai/concierge-widget.tsx:230-241).
   */
  it("returns to the form when the reader moves to another public page", async () => {
    const {footer, input, form, status, navigateTo, submit, type} = await renderFooter();

    type("reader@example.com");
    submit();
    expect(status).toHaveTextContent("This page does not create a subscription automatically.");
    expect(form).toHaveAttribute("hidden");

    await navigateTo("/events");

    expect(footer.contains(form)).toBe(true);
    expect(form).not.toHaveAttribute("hidden");
    expect(status).toBeEmptyDOMElement();
    expect(input).toHaveValue("");
  });

  it("keeps the Chinese footer bilingual", async () => {
    render(await SiteFooter({locale: "zh-HK"}));
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("探索")).toBeInTheDocument();
    expect(footer.querySelector("address")!.textContent).toContain("KOHO");
    expect(within(footer).getByText("Technology + Wisdom. Hong Kong + The World.")).toBeInTheDocument();
  });
});

import {render, screen, within, fireEvent} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

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
        {raw: (key: string) => read(locale, namespace, key)},
      ),
  };
});
vi.mock("next/image", () => ({
  default: ({priority: _priority, ...props}: React.ImgHTMLAttributes<HTMLImageElement> & {priority?: boolean}) => <img {...props} />,
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({replace: vi.fn()}),
  Link: ({href, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) => <a href={href} {...props} />,
}));
vi.mock("next/navigation", () => ({useSearchParams: () => new URLSearchParams()}));

import {SiteFooter} from "@/components/layout/site-footer";
import {siteConfig} from "@/config/site";

const assign = vi.fn();

beforeEach(() => {
  assign.mockReset();
  vi.spyOn(window, "location", "get").mockReturnValue({...window.location, assign} as unknown as Location);
});
afterEach(() => vi.restoreAllMocks());

/** The newsletter block, addressed the way a reader reaches it. */
async function renderFooter() {
  render(await SiteFooter({locale: "en"}));
  const footer = screen.getByRole("contentinfo");
  const input = within(footer).getByLabelText("Work email");
  return {
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
   * Without script the browser GETs the mailto and appends the form fields as a query string.
   * Mail clients honour `subject` and ignore everything else, so the reader reaches a titled
   * but empty message addressed to WTIA — the typed address cannot travel, because building
   * the body needs the script. That is still a working route, which an inert form is not.
   */
  it("degrades to a titled mail draft when the script never runs", async () => {
    const {form} = await renderFooter();

    expect(form).toHaveAttribute("action", `mailto:${siteConfig.contact.email}`);
    expect(form.querySelector('input[type="hidden"][name="subject"]'))
      .toHaveValue("WiseTech activity updates");
  });

  it("keeps the Chinese footer bilingual", async () => {
    render(await SiteFooter({locale: "zh-HK"}));
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("探索")).toBeInTheDocument();
    expect(footer.querySelector("address")!.textContent).toContain("KOHO");
    expect(within(footer).getByText("Technology + Wisdom. Hong Kong + The World.")).toBeInTheDocument();
  });
});

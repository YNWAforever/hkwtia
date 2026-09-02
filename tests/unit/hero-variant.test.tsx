import {render} from "@testing-library/react";
import {act} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {afterEach, describe, expect, it, vi} from "vitest";

const {pathnameState} = vi.hoisted(() => ({pathnameState: {current: "/"}}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => pathnameState.current,
  useRouter: () => ({replace: vi.fn()}),
  Link: ({href, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) => <a href={href} {...props} />,
}));

import {HeaderShell} from "@/components/layout/header-shell";
import {
  DEFAULT_HEADER_VARIANT,
  heroVariantByRoute,
  resolveHeaderVariant,
} from "@/lib/public-shell/hero-variant";

afterEach(() => {
  window.scrollY = 0;
});

describe("hero variant", () => {
  it("keeps the overlay list to routes that open with a full-bleed hero", () => {
    expect(heroVariantByRoute).toEqual({"/": "overlay"});
    expect(DEFAULT_HEADER_VARIANT).toBe("solid");
  });

  it.each([
    ["/", "overlay"],
    ["/events", "solid"],
    ["/about/history", "solid"],
    ["/unknown", "solid"],
    ["/events/", "solid"],
  ] as const)("resolves %s to %s", (pathname, variant) => {
    expect(resolveHeaderVariant(pathname)).toBe(variant);
  });
});

describe("HeaderShell", () => {
  it("puts the per-route variant in the server markup, before any effect can run", () => {
    pathnameState.current = "/";
    const overlay = renderToStaticMarkup(<HeaderShell hasAnnouncement><span /></HeaderShell>);
    expect(overlay).toContain('data-variant="overlay"');
    expect(overlay).toContain('class="site-header"');

    pathnameState.current = "/events";
    const solid = renderToStaticMarkup(<HeaderShell hasAnnouncement={false}><span /></HeaderShell>);
    expect(solid).toContain('data-variant="solid"');
    expect(solid).toContain("site-header no-announcement");
    expect(solid).not.toContain("scrolled");
  });

  it("adds and removes the scrolled class at the 56px threshold", () => {
    pathnameState.current = "/";
    const {container} = render(<HeaderShell hasAnnouncement={false}><span /></HeaderShell>);
    const header = container.querySelector("header")!;
    expect(header.classList.contains("scrolled")).toBe(false);

    act(() => {
      window.scrollY = 57;
      window.dispatchEvent(new Event("scroll"));
    });
    expect(header.classList.contains("scrolled")).toBe(true);

    act(() => {
      window.scrollY = 20;
      window.dispatchEvent(new Event("scroll"));
    });
    expect(header.classList.contains("scrolled")).toBe(false);
  });

  it("stops listening once unmounted", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const view = render(<HeaderShell hasAnnouncement={false}><span /></HeaderShell>);
    view.unmount();
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
    remove.mockRestore();
  });
});

import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {DualBrandLockup} from "@/components/layout/dual-brand-lockup";

vi.mock("next/image", () => ({
  default: ({priority, preload, ...props}: React.ImgHTMLAttributes<HTMLImageElement> & {priority?: boolean; preload?: boolean}) => {
    void priority;
    void preload;
    return <img {...props} />;
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({href, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) =>
    <a href={href} {...props} />,
}));

const labels = {
  homeLabel: "WiseTech Hong Kong home",
  publicName: "WiseTech Hong Kong",
  descriptor: "The evolving AI+ industry platform of the Hong Kong Wireless Technology Industry Association",
  logoAlt: "WTIA",
};

describe("DualBrandLockup", () => {
  it("renders the donor tile with the WTIA logo and the D-10 descriptor", () => {
    const {container} = render(<DualBrandLockup labels={labels} priority />);

    const link = screen.getByRole("link", {name: new RegExp(labels.publicName)});
    expect(link).toHaveAccessibleName(`${labels.logoAlt} ${labels.publicName} ${labels.descriptor} ${labels.homeLabel}`);
    expect(link).not.toHaveAttribute("aria-label");
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveClass("brand");
    expect(container.querySelector(".brand-logo-wrap")).not.toBeNull();
    expect(screen.getByRole("img", {name: labels.logoAlt})).toHaveAttribute("src", "/images/wtia-logo.png");
    expect(screen.getByText(labels.publicName).tagName).toBe("STRONG");
    expect(screen.getByText(labels.descriptor).tagName).toBe("SMALL");
  });

  it("requests a logo sized for the mobile and desktop tile", () => {
    render(<DualBrandLockup labels={labels} priority />);
    expect(screen.getByRole("img", {name: labels.logoAlt})).toHaveAttribute("sizes", "(max-width: 820px) 96px, 135px");
  });

  // The anchor's rendered width floor is the 108px `.brand-logo-wrap` tile, not `min-w-11`:
  // the port's `.brand { min-width: 0 }` overrides that utility at runtime. This case pins the
  // class list and the 44px height floor, which nothing in the port contests.
  it("keeps the tap-floor classes and the 44px height with long localized labels", () => {
    const longLabels = {
      ...labels,
      publicName: "WiseTech Hong Kong 香港智慧科技創新協會國際合作及企業創新發展中心",
      descriptor: "由香港智慧科技創新協會營運並提供本地社群及產業支援服務",
    };

    render(<DualBrandLockup labels={longLabels} />);

    const link = screen.getByRole("link", {name: new RegExp(longLabels.publicName)});
    expect(link).toHaveAccessibleName(expect.stringContaining(longLabels.descriptor));
    expect(link).toHaveAccessibleName(expect.stringContaining(longLabels.homeLabel));
    expect(link).toHaveClass("min-h-11", "min-w-11", "max-w-full");
    expect(screen.getByRole("img", {name: longLabels.logoAlt})).toHaveClass("object-contain");
  });

  it("uses the mono-white lockup on the navy footer and keeps full-colour on light chrome", () => {
    const {unmount} = render(<DualBrandLockup labels={labels} surface="navy" />);
    expect(screen.getByRole("img", {name: labels.logoAlt})).toHaveAttribute("src", "/images/wtia-logo-mono-white.svg");
    unmount();
    render(<DualBrandLockup labels={labels} />);
    expect(screen.getByRole("img", {name: labels.logoAlt})).toHaveAttribute("src", "/images/wtia-logo.png");
  });
});

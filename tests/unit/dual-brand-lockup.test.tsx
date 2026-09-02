import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {DualBrandLockup} from "@/components/layout/dual-brand-lockup";

vi.mock("next/image", () => ({
  default: ({priority: _priority, ...props}: React.ImgHTMLAttributes<HTMLImageElement> & {priority?: boolean}) =>
    <img {...props} />,
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

    const link = screen.getByRole("link", {name: labels.homeLabel});
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveClass("brand");
    expect(container.querySelector(".brand-logo-wrap")).not.toBeNull();
    expect(screen.getByRole("img", {name: labels.logoAlt})).toHaveAttribute("src", "/images/wtia-logo.png");
    expect(screen.getByText(labels.publicName).tagName).toBe("STRONG");
    expect(screen.getByText(labels.descriptor).tagName).toBe("SMALL");
  });

  it("keeps long localized labels inside a 44px, width-constrained target", () => {
    const longLabels = {
      ...labels,
      publicName: "WiseTech Hong Kong 香港智慧科技創新協會國際合作及企業創新發展中心",
      descriptor: "由香港智慧科技創新協會營運並提供本地社群及產業支援服務",
    };

    render(<DualBrandLockup labels={longLabels} />);

    const link = screen.getByRole("link", {name: longLabels.homeLabel});
    expect(link).toHaveClass("min-h-11", "min-w-11", "max-w-full");
    expect(screen.getByRole("img", {name: longLabels.logoAlt})).toHaveClass("object-contain");
  });
});

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
  operator: "Operated by WTIA",
  logoAlt: "WTIA",
};

describe("DualBrandLockup", () => {
  it("pairs WiseTech public identity with WTIA legal identity", () => {
    render(<DualBrandLockup labels={labels} priority />);

    expect(screen.getByRole("link", {name: labels.homeLabel})).toHaveAttribute("href", "/");
    expect(screen.getByRole("img", {name: labels.logoAlt})).toHaveAttribute("src", "/images/wtia-logo.png");
    expect(screen.getByText(labels.publicName)).toBeInTheDocument();
    expect(screen.getByText(labels.operator)).toBeInTheDocument();
  });
});

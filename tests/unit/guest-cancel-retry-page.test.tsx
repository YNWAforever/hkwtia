import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

vi.mock("next-intl/server", () => ({getTranslations: async () => (key: string) => key, setRequestLocale: () => undefined}));
vi.mock("next/navigation", () => ({notFound: () => { throw new Error("NEXT_NOT_FOUND"); }}));
vi.mock("@/i18n/navigation", () => ({Link: ({children, ...props}: {children: React.ReactNode; href: string}) => <a {...props}>{children}</a>}));

import GuestCancelPage from "@/app/[locale]/(public)/events/guest-cancel/page";

const token = "a".repeat(32);
const render = async (error?: string) => renderToStaticMarkup(await GuestCancelPage({
  params: Promise.resolve({locale: "en"}),
  searchParams: Promise.resolve({token, error}),
}));

describe("guest cancellation retry page", () => {
  it("shows a retryable outage notice while retaining the cancellation form and token", async () => {
    const html = await render("unavailable");
    expect(html).toContain("guest.cancelUnavailable");
    expect(html).toContain('role="alert"');
    expect(html).toContain(`name="token" value="${token}"`);
    expect(html).toContain('type="submit"');
  });

  it("does not show an outage notice on the normal confirmation page", async () => {
    expect(await render()).not.toContain("guest.cancelUnavailable");
  });
});

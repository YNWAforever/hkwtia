import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";

const signOut = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/client", () => ({authClient: {signOut: signOut}}));
vi.mock("@/i18n/navigation", () => ({useRouter: () => ({push, refresh})}));

import {PortalSignOutButton} from "@/components/portal/portal-sign-out-button";

describe("PortalSignOutButton", () => {
  afterEach(() => {
    window.sessionStorage.clear();
    signOut.mockClear();
    push.mockClear();
    refresh.mockClear();
  });
  it("disables itself while pending, then replaces history and refreshes on success", async () => {
    window.sessionStorage.setItem("wtia:inbox-protected:synthetic","opaque");
    signOut.mockResolvedValueOnce({});
    render(<PortalSignOutButton label="Sign out" errorLabel="Sign out failed" />);
    const button = screen.getByRole("button", {name: "Sign out"});

    fireEvent.click(button);
    expect(button).toBeDisabled();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/member-login"));
    expect(refresh).toHaveBeenCalled();
    expect(window.sessionStorage.getItem("wtia:inbox-protected:synthetic")).toBeNull();
  });

  it("reports a localized alert and does not navigate on failure", async () => {
    window.sessionStorage.setItem("wtia:inbox-protected:synthetic","opaque");
    signOut.mockRejectedValueOnce(new Error("network"));
    render(<PortalSignOutButton label="Sign out" errorLabel="Sign out failed" />);
    fireEvent.click(screen.getByRole("button", {name: "Sign out"}));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sign out failed");
    expect(push).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("wtia:inbox-protected:synthetic")).toBe("opaque");
  });
});

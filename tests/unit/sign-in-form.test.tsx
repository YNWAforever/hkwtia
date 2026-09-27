import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
const social = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/client", () => ({authClient: {signIn: {social}}}));
import {SignInForm, maskEmail} from "@/components/auth/sign-in-form";
const labels = {email: "Email", send: "Send sign-in link", resend: "Resend link", sending: "Sending", google: "Continue with Google", separator: "or", changeEmail: "Change email", sent: "Check your inbox", googleUnavailable: "Google sign-in needs setup", providerError: "Try again", maskedTo: "Sent to", waitSeconds: "Wait"};
const props = {intent: "member" as const, locale: "en" as const, destination: "/portal/billing", action: async () => undefined, labels};

describe("shared sign-in form", () => {
  beforeEach(() => {social.mockReset(); sessionStorage.clear();});
  it("masks a recipient without exposing the full address", () => {
    expect(maskEmail("synthetic@example.test")).toBe("s***@e***.test");
  });
  it("shows both methods but gates Google until provider readiness is confirmed", () => {
    render(<SignInForm {...props} googleEnabled={false}/>);
    expect(screen.getByTestId("member-login-form")).toHaveAttribute("data-continuation", "/portal/billing");
    expect(screen.getByRole("button", {name: "Continue with Google"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "Send sign-in link"})).toBeEnabled();
  });
  it("uses the installed Neon SDK with a localized, validated callback", async () => {
    social.mockResolvedValue({data: {url: "https://provider.example.test"}, error: null});
    render(<SignInForm {...props} locale="zh-HK" intent="admin" destination="/admin/inbox" googleEnabled/>);
    fireEvent.click(screen.getByRole("button", {name: "Continue with Google"}));
    await waitFor(() => expect(social).toHaveBeenCalledWith({provider: "google", callbackURL: "/zh/admin-login?next=%2Fadmin%2Finbox"}));
  });
  it("offers recoverable feedback when the provider rejects initiation", async () => {
    social.mockResolvedValue({error: {message: "internal secret"}});
    render(<SignInForm {...props} googleEnabled/>);
    fireEvent.click(screen.getByRole("button", {name: "Continue with Google"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
    expect(screen.getByRole("alert")).not.toHaveTextContent("internal secret");
  });
  it("offers change email after a sent link without putting the address in the URL", async () => {
    sessionStorage.setItem("hkwtia-login-mask-member", "s***@e***.test");
    render(<SignInForm {...props} googleEnabled={false} sent/>);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("s***@e***.test"));
    fireEvent.click(screen.getByRole("button", {name: "Change email"}));
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
});

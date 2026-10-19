import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
const social = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/client", () => ({authClient: {signIn: {social}}}));
import {SignInForm, maskEmail} from "@/components/auth/sign-in-form";
import en from "@/messages/en.json";
import zhHK from "@/messages/zh-HK.json";
const labels = {email: "Email", send: "Send sign-in link", resend: "Resend link", sending: "Sending", google: "Continue with Google", separator: "or", changeEmail: "Change email", sent: "Check your inbox", googleUnavailable: "Google sign-in needs setup", providerError: "Try again", maskedTo: "Sent to", waitSeconds: "Wait"};
const props = {intent: "member" as const, locale: "en" as const, destination: "/portal/billing", action: async () => undefined, labels};

describe("shared sign-in form", () => {
  beforeEach(() => {social.mockReset(); sessionStorage.clear();});
  afterEach(() => {vi.useRealTimers(); vi.restoreAllMocks();});
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
  it("keeps a network failure distinct from rate-limiting and validation without exposing internal errors", async () => {
    social.mockRejectedValue(new Error("private network endpoint"));
    render(<SignInForm {...props} googleEnabled/>);
    fireEvent.click(screen.getByRole("button", {name: "Continue with Google"}));
    expect(await screen.findByRole("alert")).toHaveTextContent(labels.providerError);
    expect(screen.queryByText(/Wait/)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).not.toHaveTextContent("private network endpoint");
    expect(screen.getByRole("button", {name: labels.google})).toBeEnabled();
  });

  it.each(["en", "zh-HK"] as const)("renders a localized wait with seconds and a labeled keyboard input in %s", (locale) => {
    const copy = (locale === "en" ? en : zhHK).MemberLogin;
    render(<SignInForm {...props} locale={locale} googleEnabled={false} retryAfterSeconds={120}
      labels={{...labels, email: copy.emailLabel, waitSeconds: copy.waitSeconds}}/>);
    const email = screen.getByRole("textbox", {name: copy.emailLabel});
    email.focus();
    expect(email).toHaveFocus();
    expect(screen.getByText(copy.waitSeconds, {exact: false})).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText(copy.waitSeconds, {exact: false})).toHaveTextContent("120");
  });
  it("shows confirmation when the same form receives a new sent result", () => {
    const {rerender} = render(<SignInForm {...props} googleEnabled sent={false}/>);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    rerender(<SignInForm {...props} googleEnabled sent/>);
    expect(screen.getByRole("status")).toHaveTextContent("Check your inbox");
  });
  it("offers change email after a sent link without putting the address in the URL", async () => {
    sessionStorage.setItem("hkwtia-login-mask-member", "s***@e***.test");
    render(<SignInForm {...props} googleEnabled={false} sent/>);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("s***@e***.test"));
    const changeEmail = screen.getByRole("link", {name: "Change email"});
    expect(changeEmail).toHaveAttribute("href", "/member-login?next=%2Fportal%2Fbilling");
    expect(changeEmail).not.toHaveAttribute("href", expect.stringContaining("synthetic"));
  });

  it("does not start a resend cooldown before the server reports a rate-limit or success outcome", async () => {
    const submit = vi.fn(async () => undefined);
    render(<SignInForm {...props} action={submit} googleEnabled={false}/>);
    fireEvent.change(screen.getByLabelText("Email"), {target: {value: "not-an-email"}});
    await act(async () => {fireEvent.submit(screen.getByTestId("member-login-form"));});
    expect(sessionStorage.getItem("hkwtia-login-resend-member")).toBeNull();
  });

  it("keeps one sent cooldown across a remount instead of extending it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    const first = render(<SignInForm {...props} googleEnabled={false} sent/>);
    await act(async () => undefined);
    const originalDeadline = Number(sessionStorage.getItem("hkwtia-login-resend-member"));
    expect(originalDeadline).toBe(Date.now() + 60_000);

    await act(async () => {await vi.advanceTimersByTimeAsync(10_000);});
    first.unmount();
    render(<SignInForm {...props} googleEnabled={false} sent/>);
    await act(async () => undefined);
    expect(Number(sessionStorage.getItem("hkwtia-login-resend-member"))).toBe(originalDeadline);
  });

  it("still expires a rate-limit cooldown when sessionStorage is unavailable and never auto-submits", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {throw new Error("storage unavailable");});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {throw new Error("storage unavailable");});
    const submit = vi.fn(async () => undefined);
    render(<SignInForm {...props} action={submit} googleEnabled={false} retryAfterSeconds={2}/>);
    const button = screen.getByRole("button", {name: "Send sign-in link"});
    expect(button).toBeDisabled();

    await act(async () => {await vi.advanceTimersByTimeAsync(2_100);});
    expect(button).toBeEnabled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("does not restart an expired sent cooldown when the old confirmation page is reloaded", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    const first = render(<SignInForm {...props} googleEnabled={false} sent/>);
    await act(async () => {await vi.advanceTimersByTimeAsync(61_000);});
    expect(screen.getByRole("button", {name: "Resend link"})).toBeEnabled();
    first.unmount();
    render(<SignInForm {...props} googleEnabled={false} sent/>);
    await act(async () => {await vi.advanceTimersByTimeAsync(1);});
    expect(screen.getByRole("button", {name: "Resend link"})).toBeEnabled();
  });

  it("preserves an absolute retry deadline across locale changes and reloads without browser storage", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {throw new Error("unavailable");});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {throw new Error("unavailable");});
    const outcome = {retryAfterSeconds: 2, retryUntil: Date.now() + 2_000};
    const first = render(<SignInForm {...props} {...outcome} googleEnabled={false}/>);
    await act(async () => {await vi.advanceTimersByTimeAsync(1_000);});
    first.unmount();
    render(<SignInForm {...props} {...outcome} locale="zh-HK" googleEnabled={false}/>);
    await act(async () => {await vi.advanceTimersByTimeAsync(1_100);});
    expect(screen.getByRole("button", {name: "Send sign-in link"})).toBeEnabled();
  });

  it("honours a newer rate-limit deadline instead of reusing a shorter previous sent wait", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    sessionStorage.setItem("hkwtia-login-resend-member", String(Date.now() + 10_000));
    const outcome = {retryAfterSeconds: 120, retryUntil: Date.now() + 120_000};
    render(<SignInForm {...props} {...outcome} googleEnabled={false}/>);
    await act(async () => {await vi.advanceTimersByTimeAsync(11_000);});
    expect(screen.getByRole("button", {name: "Send sign-in link"})).toBeDisabled();
    expect(screen.getByText(/Wait/)).toHaveTextContent("109");
  });

  it("uses a fresh shorter server deadline instead of extending it with an older stored outcome", async () => {
    vi.useFakeTimers();
    sessionStorage.setItem("hkwtia-login-resend-member", String(Date.now() + 120_000));
    render(<SignInForm {...props} googleEnabled={false} retryAfterSeconds={2} retryUntil={Date.now() + 2_000}/>);
    await act(async () => {await vi.advanceTimersByTimeAsync(2_100);});
    expect(screen.getByRole("button", {name: "Send sign-in link"})).toBeEnabled();
  });

  it("keeps the active connection wait when changing email instead of clearing it by navigation", async () => {
    vi.useFakeTimers();
    const first = render(<SignInForm {...props} googleEnabled={false} sent/>);
    first.unmount();
    render(<SignInForm {...props} googleEnabled={false}/>);
    await act(async () => {await vi.advanceTimersByTimeAsync(1);});
    expect(screen.getByRole("button", {name: "Send sign-in link"})).toBeDisabled();
    await act(async () => {await vi.advanceTimersByTimeAsync(60_000);});
    expect(screen.getByRole("button", {name: "Send sign-in link"})).toBeEnabled();
  });

  it("blocks form submission during the wait and only permits an explicit retry after it expires", async () => {
    vi.useFakeTimers();
    const submit = vi.fn(async () => undefined);
    render(<SignInForm {...props} action={submit} googleEnabled={false} retryAfterSeconds={2}/>);
    fireEvent.change(screen.getByLabelText("Email"), {target: {value: "offline@example.test"}});
    await act(async () => {fireEvent.submit(screen.getByTestId("member-login-form"));});
    expect(submit).not.toHaveBeenCalled();
    await act(async () => {await vi.advanceTimersByTimeAsync(2_100);});
    expect(submit).not.toHaveBeenCalled();
    await act(async () => {fireEvent.submit(screen.getByTestId("member-login-form"));});
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("discards a corrupt unbounded stored deadline instead of leaving the form disabled indefinitely", async () => {
    vi.useFakeTimers();
    sessionStorage.setItem("hkwtia-login-resend-member", "100000000000000000000");
    render(<SignInForm {...props} googleEnabled={false} retryAfterSeconds={2}/>);
    await act(async () => {await vi.advanceTimersByTimeAsync(2_100);});
    expect(screen.getByRole("button", {name: "Send sign-in link"})).toBeEnabled();
  });
});

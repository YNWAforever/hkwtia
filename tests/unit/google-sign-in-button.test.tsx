import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";

import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const social = vi.fn();
vi.mock("@/lib/auth/client", () => ({authClient: {signIn: {social: (...args: unknown[]) => social(...args)}}}));

import {GoogleSignInButton} from "@/components/auth/google-sign-in-button";

const labels = {google: "Continue with Google", googleUnavailable: "Google sign-in is unavailable", providerError: "Google sign-in failed"};

describe("GoogleSignInButton", () => {
  beforeEach(() => social.mockReset());

  // Round 20: a top-level import of the auth client put ~400KB of decoded script (Better Auth
  // with Zod and phone-number code) on /join and the sign-in pages before anyone clicked. The
  // client is imported on demand instead; this pins that it stays out of the module graph.
  it("does not import the auth client at module level", () => {
    const source = readFileSync("components/auth/google-sign-in-button.tsx", "utf8");
    expect(source).not.toMatch(/^import[^;]*["']@\/lib\/auth\/client["']/m);
    expect(source).toMatch(/import\(["']@\/lib\/auth\/client["']\)/);
  });

  it("no component or page imports the auth client at module level", () => {
    const files = execFileSync("git", ["ls-files", "components", "app"], {encoding: "utf8"}).split("\n").filter((file) => file.endsWith(".tsx"));
    const offenders = files.filter((file) => /^import[^;]*["']@\/lib\/auth\/client["']/m.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("starts Google sign-in with the callback when clicked", async () => {
    social.mockResolvedValue({});
    render(<GoogleSignInButton callbackURL="/join/profile" enabled labels={labels} />);
    fireEvent.click(screen.getByRole("button", {name: labels.google}));
    await waitFor(() => expect(social).toHaveBeenCalledWith({provider: "google", callbackURL: "/join/profile"}));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the provider error when sign-in fails", async () => {
    social.mockResolvedValue({error: {message: "nope"}});
    render(<GoogleSignInButton callbackURL="/join/profile" enabled labels={labels} />);
    fireEvent.click(screen.getByRole("button", {name: labels.google}));
    expect(await screen.findByRole("alert")).toHaveTextContent(labels.providerError);
  });

  it("does nothing while disabled", async () => {
    render(<GoogleSignInButton callbackURL="/join/profile" enabled={false} labels={labels} />);
    fireEvent.click(screen.getByRole("button", {name: labels.google}));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(social).not.toHaveBeenCalled();
    expect(screen.getByText(labels.googleUnavailable)).toBeInTheDocument();
  });
});

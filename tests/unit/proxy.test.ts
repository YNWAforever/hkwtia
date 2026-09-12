import {describe, expect, it} from "vitest";
import {NextRequest} from "next/server";

import {createNeonAuthExchange, type NeonAuthExchangeResult} from "@/proxy";

const env = () => ({neonAuthBaseUrl: "https://auth.example.test", neonAuthCookieSecret: "s".repeat(32)});

function runner(result: NeonAuthExchangeResult) {
  return async () => result;
}

describe("createNeonAuthExchange", () => {
  it("completes a pending magic-link/OAuth exchange, redirecting with the session cookie attached and the verifier gone", async () => {
    const redirectUrl = new URL("https://hkwtia.vercel.app/zh/member-login?next=%2Fportal");
    const exchange = createNeonAuthExchange(
      runner({action: "redirect_oauth", redirectUrl, cookies: ["neon_auth.session_token=abc; Path=/; HttpOnly"]}),
      env,
    );
    const request = new NextRequest("https://hkwtia.vercel.app/zh/member-login?next=%2Fportal&neon_auth_session_verifier=ml-test");

    const response = await exchange(request);

    expect(response).not.toBeNull();
    expect(response!.headers.get("location")).toBe(redirectUrl.toString());
    expect(response!.headers.get("set-cookie")).toContain("neon_auth.session_token=abc");
  });

  it("defers to ordinary routing when there is nothing to exchange", async () => {
    const exchange = createNeonAuthExchange(runner({action: "allow"}), env);

    expect(await exchange(new NextRequest("https://hkwtia.vercel.app/zh/admin"))).toBeNull();
  });

  it("ignores the SDK's own route-protection verdict -- /admin must keep hiding behind notFound(), never reveal itself via a login redirect", async () => {
    const exchange = createNeonAuthExchange(
      runner({action: "redirect_login", redirectUrl: new URL("https://hkwtia.vercel.app/member-login")} as NeonAuthExchangeResult),
      env,
    );

    expect(await exchange(new NextRequest("https://hkwtia.vercel.app/zh/admin"))).toBeNull();
  });

  it("fails open when the Neon Auth environment is misconfigured, rather than breaking every request on the site", async () => {
    let called = false;
    const exchange = createNeonAuthExchange(
      async () => { called = true; return {action: "allow"}; },
      () => { throw new Error("NEON_AUTH_BASE_URL is required"); },
    );

    const response = await exchange(new NextRequest("https://hkwtia.vercel.app/zh/member-login?neon_auth_session_verifier=ml-test"));

    expect(response).toBeNull();
    expect(called).toBe(false);
  });

  it(
    "passes a loginUrl the SDK can never match against a real request path, so its own " +
    "\"already at the login page\" bail-out cannot suppress the exchange -- this app's " +
    "unprefixed (English) callback URL is literally /member-login, identical to the login " +
    "form itself, which is exactly what that bail-out is meant to detect",
    async () => {
      let capturedLoginUrl = "";
      const exchange = createNeonAuthExchange(
        async (config) => { capturedLoginUrl = config.loginUrl; return {action: "allow"}; },
        env,
      );

      await exchange(new NextRequest("https://hkwtia.vercel.app/member-login?neon_auth_session_verifier=ml-test"));

      const loginUrl = new URL(capturedLoginUrl, "https://hkwtia.vercel.app");
      expect(loginUrl.origin).not.toBe("https://hkwtia.vercel.app");
    },
  );
});

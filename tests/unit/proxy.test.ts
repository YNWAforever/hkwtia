import {describe, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";

import {createNeonAuthExchange, type NeonAuthExchangeRunner} from "@/proxy";

const env = () => ({neonAuthBaseUrl: "https://auth.example.test", neonAuthCookieSecret: "s".repeat(32)});

const SESSION_COOKIE = "__Secure-neon-auth.session_token";
const CALLBACK = "https://hkwtia.vercel.app/zh/member-login?next=%2Fportal&neon_auth_session_verifier=ml-test";

/** A Neon `get-session` answer that mints a session, as the real one does on success. */
function minted(): Response {
  const response = new Response(null, {status: 200});
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=abc; Path=/; HttpOnly; Secure`);
  response.headers.append("Set-Cookie", "__Secure-neon-auth.local.session_data=new-cache; Path=/; HttpOnly; Secure");
  return response;
}

describe("createNeonAuthExchange", () => {
  it("exchanges the verifier for a session, redirecting with the cookie attached and the spent token stripped", async () => {
    const exchange = createNeonAuthExchange(async () => minted(), env);

    const response = await exchange(new NextRequest(CALLBACK));

    expect(response).not.toBeNull();
    expect(response!.headers.get("set-cookie")).toContain(SESSION_COOKIE);
    const location = new URL(response!.headers.get("location")!);
    // The verifier is one-time: leaving it on the URL invites a second, spent replay.
    expect(location.searchParams.has("neon_auth_session_verifier")).toBe(false);
    expect(location.pathname).toBe("/zh/member-login");
    expect(location.searchParams.get("next")).toBe("/portal");
  });

  it("asks Neon for the session with the verifier still on the request URL", async () => {
    let seen: string | undefined;
    const exchange = createNeonAuthExchange(async ({request, path}) => {
      seen = `${path}|${new URL(request.url).searchParams.get("neon_auth_session_verifier")}`;
      return minted();
    }, env);

    await exchange(new NextRequest(CALLBACK));

    expect(seen).toBe("get-session|ml-test");
  });

  it("leaves a request with no verifier entirely alone, without calling upstream", async () => {
    let called = false;
    const exchange = createNeonAuthExchange(async () => { called = true; return minted(); }, env);

    expect(await exchange(new NextRequest("https://hkwtia.vercel.app/zh/admin"))).toBeNull();
    expect(called).toBe(false);
  });

  it("exchanges a fresh verifier despite stale session cookies and isolates the forwarded request", async () => {
    const run = vi.fn<NeonAuthExchangeRunner>(async () => minted());
    const exchange = createNeonAuthExchange(run, env);
    const request = new NextRequest(CALLBACK, {headers: {cookie:
      `${SESSION_COOKIE}=stale; __Secure-neon-auth.local.session_data=old-cache; preference=zh`,
    }});

    const response = await exchange(request);

    expect(run).toHaveBeenCalledTimes(1);
    const forwarded = run.mock.calls[0];
    expect(forwarded[0].request.headers.get("cookie")).toBe("preference=zh");
    expect(forwarded[0].request.cookies.has(SESSION_COOKIE)).toBe(false);
    expect(request.cookies.has(SESSION_COOKIE)).toBe(true);
    expect(response?.headers.getSetCookie()).toEqual(minted().headers.getSetCookie());
    const location = new URL(response!.headers.get("location")!);
    expect(location.searchParams.has("neon_auth_session_verifier")).toBe(false);
    expect(location.searchParams.get("next")).toBe("/portal");
  });

  it("falls through without redirect or cookie mutation when a verifier is refused with an existing session", async () => {
    const run = vi.fn(async () => new Response(null, {status: 401}));
    const exchange = createNeonAuthExchange(run, env);
    const request = new NextRequest(CALLBACK);
    request.cookies.set(SESSION_COOKIE, "existing-session");

    expect(await exchange(request)).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
    expect(request.cookies.has(SESSION_COOKIE)).toBe(true);
    expect(request.nextUrl.searchParams.has("neon_auth_session_verifier")).toBe(true);
  });

  it("falls through unchanged when Neon declines to mint a session, rather than stripping the verifier", async () => {
    const exchange = createNeonAuthExchange(async () => new Response(null, {status: 401}), env);

    expect(await exchange(new NextRequest(CALLBACK))).toBeNull();
  });

  it("falls through when Neon answers 200 but mints no cookie, so the visitor keeps a retryable link", async () => {
    const exchange = createNeonAuthExchange(async () => new Response(null, {status: 200}), env);

    expect(await exchange(new NextRequest(CALLBACK))).toBeNull();
  });

  it("survives an upstream outage instead of turning the login page into an error page", async () => {
    const exchange = createNeonAuthExchange(async () => { throw new Error("ECONNRESET"); }, env);

    expect(await exchange(new NextRequest(CALLBACK))).toBeNull();
  });

  it("fails open when the Neon Auth environment is misconfigured, rather than breaking every request", async () => {
    let called = false;
    const exchange = createNeonAuthExchange(
      async () => { called = true; return minted(); },
      () => { throw new Error("NEON_AUTH_BASE_URL is required"); },
    );

    expect(await exchange(new NextRequest(CALLBACK))).toBeNull();
    expect(called).toBe(false);
  });

  it("warns exactly once when Neon refuses to mint a session, and stays silent otherwise", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const refused = createNeonAuthExchange(async () => new Response(null, {status: 401}), env);
      await refused(new NextRequest(CALLBACK));
      expect(warn).toHaveBeenCalledTimes(1);

      warn.mockClear();
      const ok = createNeonAuthExchange(async () => minted(), env);
      await ok(new NextRequest(CALLBACK));
      // A successful exchange and an ordinary request are both unremarkable.
      await ok(new NextRequest("https://hkwtia.vercel.app/zh/admin"));
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

import {renderToStaticMarkup} from "react-dom/server";
import {afterEach, describe, expect, it, vi} from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `localized:${key}`,
  setRequestLocale: vi.fn(),
}));

import UnsubscribePage from "@/app/[locale]/(public)/unsubscribe/page";
import {createUnsubscribePost} from "@/lib/api/unsubscribe-route";
import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "@/lib/email/unsubscribe-token";
import {
  createSuppressionsRepository,
  unsubscribeActor,
} from "@/lib/db/repos/suppressions";

const secret = "fixture-cron-secret-with-enough-entropy";
const future = 2_000_000_000;
const past = 1_900_000_000;

function token(locale: "en" | "zh-HK" = "en") {
  return signUnsubscribeToken({
    profileId: "profile-1",
    exp: future,
    locale,
  }, secret);
}

describe("unsubscribe token", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips the signed base64url payload before expiration", () => {
    expect(verifyUnsubscribeToken(token("zh-HK"), secret, past)).toEqual({
      profileId: "profile-1",
      exp: future,
      locale: "zh-HK",
    });
  });

  it.each([
    ["tampered", (): string => `${token().slice(0, -1)}x`],
    ["expired", (): string => token()],
    ["malformed", (): string => "not-a-signed-token"],
  ] as const)("rejects %s tokens without throwing", (kind, makeToken) => {
    const now = kind === "expired" ? future : past;
    expect(verifyUnsubscribeToken(makeToken(), secret, now)).toBeNull();
  });

  it("atomically delegates valid POSTs and returns success for both created and existing suppression", async () => {
    const unsubscribeEmailMarketing = vi.fn()
      .mockResolvedValueOnce("created")
      .mockResolvedValueOnce("existing");
    const post = createUnsubscribePost({
      secrets: [secret],
      appUrl: "https://www.hkwtia.org",
      now: () => past,
      unsubscribeEmailMarketing,
    });
    const url = `https://www.hkwtia.org/api/unsubscribe?token=${encodeURIComponent(token())}`;

    const first = await post(new Request(url, {method: "POST"}));
    const second = await post(new Request(url, {method: "POST"}));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ok: true});
    await expect(second.json()).resolves.toEqual({ok: true});
    expect(unsubscribeEmailMarketing).toHaveBeenNthCalledWith(1, "profile-1");
    expect(unsubscribeEmailMarketing).toHaveBeenNthCalledWith(2, "profile-1");
  });

  it("rejects an invalid POST before repository access", async () => {
    const unsubscribeEmailMarketing = vi.fn();
    const post = createUnsubscribePost({
      secrets: [secret],
      appUrl: "https://www.hkwtia.org",
      now: () => past,
      unsubscribeEmailMarketing,
    });

    const response = await post(new Request(
      "https://www.hkwtia.org/api/unsubscribe?token=invalid",
      {method: "POST"},
    ));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({error: "INVALID_UNSUBSCRIBE_TOKEN"});
    expect(unsubscribeEmailMarketing).not.toHaveBeenCalled();
  });

  it("redirects the confirmation form only to the token's localized success page", async () => {
    const post = createUnsubscribePost({
      secrets: [secret],
      appUrl: "https://www.hkwtia.org",
      now: () => past,
      unsubscribeEmailMarketing: async () => "created",
    });
    const body = new URLSearchParams({
      token: token("zh-HK"),
      redirect: "1",
    });

    // Serialize explicitly: jsdom's URLSearchParams is a different realm from
    // the one undici brand-checks, and the route reads the body as bytes.
    const response = await post(new Request("https://attacker.example/api/unsubscribe", {
      method: "POST",
      body: body.toString(),
      headers: {"content-type": "application/x-www-form-urlencoded"},
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://www.hkwtia.org/zh/unsubscribe?status=success");
  });

  it("accepts an application/json confirmation body", async () => {
    const unsubscribeEmailMarketing = vi.fn().mockResolvedValue("created");
    const post = createUnsubscribePost({
      secrets: [secret],
      appUrl: "https://www.hkwtia.org",
      now: () => past,
      unsubscribeEmailMarketing,
    });

    const response = await post(new Request("https://attacker.example/api/unsubscribe", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({token: token(), redirect: true}),
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://www.hkwtia.org/unsubscribe?status=success");
    expect(unsubscribeEmailMarketing).toHaveBeenCalledWith("profile-1");
  });

  it("rejects unsupported request media before repository access", async () => {
    const unsubscribeEmailMarketing = vi.fn();
    const post = createUnsubscribePost({
      secrets: [secret],
      appUrl: "https://www.hkwtia.org",
      now: () => past,
      unsubscribeEmailMarketing,
    });

    const response = await post(new Request("https://www.hkwtia.org/api/unsubscribe", {
      method: "POST",
      headers: {"content-type": "text/plain"},
      body: `token=${encodeURIComponent(token())}`,
    }));

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({error: "UNSUPPORTED_MEDIA_TYPE"});
    expect(unsubscribeEmailMarketing).not.toHaveBeenCalled();
  });

  it("rejects an oversized request body before parsing or repository access", async () => {
    const unsubscribeEmailMarketing = vi.fn();
    const post = createUnsubscribePost({
      secrets: [secret],
      appUrl: "https://www.hkwtia.org",
      now: () => past,
      unsubscribeEmailMarketing,
    });
    const body = new URLSearchParams({
      token: token(),
      padding: "x".repeat(8_192),
    });

    const response = await post(new Request("https://www.hkwtia.org/api/unsubscribe", {
      method: "POST",
      body: body.toString(),
      headers: {"content-type": "application/x-www-form-urlencoded"},
    }));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({error: "UNSUBSCRIBE_BODY_TOO_LARGE"});
    expect(unsubscribeEmailMarketing).not.toHaveBeenCalled();
  });

  it("renders localized confirm, success, and invalid public states", async () => {
    vi.stubEnv("CRON_SECRET", secret);

    const confirm = renderToStaticMarkup(await UnsubscribePage({
      params: Promise.resolve({locale: "en"}),
      searchParams: Promise.resolve({token: token(), status: ""}),
    }));
    const success = renderToStaticMarkup(await UnsubscribePage({
      params: Promise.resolve({locale: "zh-HK"}),
      searchParams: Promise.resolve({status: "success"}),
    }));
    const invalid = renderToStaticMarkup(await UnsubscribePage({
      params: Promise.resolve({locale: "en"}),
      searchParams: Promise.resolve({token: "invalid"}),
    }));

    expect(confirm).toContain('data-unsubscribe-state="confirm"');
    expect(confirm).toContain('method="post"');
    expect(success).toContain('data-unsubscribe-state="success"');
    expect(invalid).toContain('data-unsubscribe-state="invalid"');
  });

  it("authorizes the dedicated unsubscribe source only at the atomic suppression repository", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce([{id: "profile-1"}])
      .mockResolvedValueOnce([{id: "suppression-1"}]);
    const database = {
      transaction: async <T>(
        callback: (transaction: {execute: typeof execute}) => Promise<T>,
      ): Promise<T> => await callback({execute}),
    };
    const repository = createSuppressionsRepository(
      async () => database as never,
    );
    const actor = unsubscribeActor();

    await expect(repository.unsubscribeEmailMarketing(actor, "profile-1", "member_unsubscribe"))
      .resolves.toBe("created");
    expect(execute).toHaveBeenCalledTimes(2);
  });
});

import {beforeEach, describe, expect, it, vi} from "vitest";

const cancelByToken = vi.hoisted(() => vi.fn<(actor: unknown, digest: string) => Promise<"cancelled" | "unknown">>(async () => "cancelled"));
vi.mock("@/lib/db/repos/event-guests", () => ({eventGuestsRepository: {cancelByToken}}));
vi.mock("@/lib/config/env", () => ({unsubscribeEnv: () => ({unsubscribeTokenSecret: "s".repeat(32)})}));

import * as cancelRoute from "@/app/api/events/guest/cancel/route";

const {GET} = cancelRoute;
import {cancelTokenDigest, signedGuestCancelToken} from "@/lib/events/guest-registration-core";

const TOKEN = "a".repeat(32);
const request = (token: string) => new Request(`https://hkwtia.example/api/events/guest/cancel?token=${token}`);

describe("GET /api/events/guest/cancel (programme B-4)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("rejects a malformed token before touching the repository", async () => {
    for (const token of ["", "short", "A".repeat(32), "z".repeat(32), "a".repeat(64), "a".repeat(31) + "-"]) {
      const response = await GET(request(token));
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("https://hkwtia.example/events?guest=invalid");
    }
    expect(cancelByToken).not.toHaveBeenCalled();
  });

  it("opens a confirmation page without changing the registration", async () => {
    const response = await GET(request(TOKEN));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://hkwtia.example/events/guest-cancel?token=" + TOKEN);
    expect(cancelByToken).not.toHaveBeenCalled();
  });

  it("requires a POST carrying the signed token to cancel and rejects a tampered signature", async () => {
    const post = Reflect.get(cancelRoute, "POST") as ((request: Request) => Promise<Response>) | undefined;
    expect(post).toBeTypeOf("function");
    if (!post) return;
    const digest = "d".repeat(64);
    const signature = "f".repeat(64);
    const submit = (token: string) => new Request("https://hkwtia.example/api/events/guest/cancel", {
      method: "POST", headers: {"content-type": "application/x-www-form-urlencoded"},
      body: new URLSearchParams({token, locale: "en"}).toString(),
    });
    const invalid = await post(submit(digest + "." + signature));
    expect(invalid.headers.get("location")).toBe("https://hkwtia.example/events?guest=invalid");
    expect(cancelByToken).not.toHaveBeenCalled();
  });

  it("cancels only on POST and passes the verified digest to the repository", async () => {
    const post = Reflect.get(cancelRoute, "POST") as ((request: Request) => Promise<Response>) | undefined;
    expect(post).toBeTypeOf("function");
    if (!post) return;
    const digest = "d".repeat(64);
    const token = signedGuestCancelToken("s".repeat(32), digest);
    const response = await post(new Request("https://hkwtia.example/api/events/guest/cancel", {
      method: "POST", headers: {"content-type": "application/x-www-form-urlencoded"},
      body: new URLSearchParams({token, locale: "zh-HK"}).toString(),
    }));
    expect(response.headers.get("location")).toBe("https://hkwtia.example/zh/events?guest=cancelled");
    expect(cancelByToken).toHaveBeenCalledWith(expect.objectContaining({kind: "contact-writer", source: "event_guest"}), digest);
  });

  it("logs a POST repository failure and redirects with guest=unknown", async () => {
    const post = Reflect.get(cancelRoute, "POST") as ((request: Request) => Promise<Response>) | undefined;
    expect(post).toBeTypeOf("function");
    if (!post) return;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    cancelByToken.mockRejectedValueOnce(new Error("connection reset"));
    const response = await post(new Request("https://hkwtia.example/api/events/guest/cancel", {
      method: "POST", headers: {"content-type": "application/x-www-form-urlencoded"},
      body: new URLSearchParams({token: TOKEN, locale: "en"}).toString(),
    }));
    expect(response.headers.get("location")).toBe("https://hkwtia.example/events?guest=unknown");
    expect(error).toHaveBeenCalledWith("guest-cancel", expect.any(Error));
    error.mockRestore();
  });
});

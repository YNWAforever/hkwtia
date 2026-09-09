import {beforeEach, describe, expect, it, vi} from "vitest";

const cancelByToken = vi.hoisted(() => vi.fn<(actor: unknown, digest: string) => Promise<"cancelled" | "unknown">>(async () => "cancelled"));
vi.mock("@/lib/db/repos/event-guests", () => ({eventGuestsRepository: {cancelByToken}}));
vi.mock("@/lib/config/env", () => ({unsubscribeEnv: () => ({unsubscribeTokenSecret: "s".repeat(32)})}));

import {GET} from "@/app/api/events/guest/cancel/route";
import {cancelTokenDigest} from "@/lib/events/guest-registration-core";

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

  it("cancels by the token's HMAC digest and never hands the raw token to the repository", async () => {
    const response = await GET(request(TOKEN));
    expect(response.headers.get("location")).toBe("https://hkwtia.example/events?guest=cancelled");
    expect(cancelByToken).toHaveBeenCalledWith(expect.objectContaining({kind: "contact-writer", source: "event_guest"}), cancelTokenDigest("s".repeat(32), TOKEN));
    expect(String(cancelByToken.mock.calls[0]?.[1])).not.toContain(TOKEN);
  });

  it("logs a repository failure and redirects with guest=unknown", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    cancelByToken.mockRejectedValueOnce(new Error("connection reset"));
    const response = await GET(request(TOKEN));
    expect(response.headers.get("location")).toBe("https://hkwtia.example/events?guest=unknown");
    expect(error).toHaveBeenCalledWith("guest-cancel", expect.any(Error));
    error.mockRestore();
  });
});

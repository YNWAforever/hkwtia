import {createHmac} from "node:crypto";

import {describe, expect, it} from "vitest";

import {PASS_TOKEN_VERSION, signPassToken, verifyPassToken} from "@/lib/tickets/pass-token";

const secret = "test-secret-not-a-real-key";
const claims = {seatId: "3f1c9d5e-6a2b-4c8d-9e0f-1a2b3c4d5e6f", eventId: "8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d"};

describe("pass tokens", () => {
  it("round-trips the claims it was signed with", () => {
    expect(verifyPassToken(signPassToken(claims, secret), secret)).toEqual({...claims, v: PASS_TOKEN_VERSION});
  });

  it("returns null for a tampered payload rather than a partial claim", () => {
    const token = signPassToken(claims, secret);
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({...claims, seatId: "00000000-0000-4000-8000-000000000000"}), "utf8").toString("base64url");
    expect(verifyPassToken(`${forged}.${signature}`, secret)).toBeNull();
    expect(verifyPassToken(`${payload}.${signature}`, "another-secret")).toBeNull();
  });

  it("returns null for a token signed under a different version, so rotation invalidates rather than reinterprets", () => {
    expect(verifyPassToken(signPassToken(claims, secret, PASS_TOKEN_VERSION + 1), secret)).toBeNull();
  });

  it("refuses malformed input without throwing", () => {
    for (const bad of ["", "no-dot", "a.b.c", "....", "x".repeat(4097)]) {
      expect(verifyPassToken(bad, secret)).toBeNull();
    }
    expect(verifyPassToken(signPassToken(claims, secret), "")).toBeNull();
  });

  it("refuses a payload whose ids are not uuids", () => {
    const forgedPayload = Buffer.from(JSON.stringify({v: PASS_TOKEN_VERSION, seatId: "not-a-uuid", eventId: claims.eventId}), "utf8").toString("base64url");
    const forgedSignature = createHmac("sha256", secret).update(forgedPayload).digest("base64url");
    expect(verifyPassToken(`${forgedPayload}.${forgedSignature}`, secret)).toBeNull();
  });
});

// @vitest-environment node
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const effects = vi.hoisted(() => ({
  actor: vi.fn(async () => null),
  provider: vi.fn(),
  databaseWrite: vi.fn(),
  service: vi.fn(() => ({startTurn: async () => {
    effects.databaseWrite();
    effects.provider();
    return {events: {async *[Symbol.asyncIterator]() {
      yield {event: "disabled", data: {taskId: "synthetic-task"}};
    }}, cancel: async () => undefined};
  }})),
}));
vi.mock("@/lib/auth/actor", () => ({getActor: effects.actor}));
vi.mock("@/lib/ai/agents/concierge", () => ({createConciergeService: effects.service}));

import {POST} from "@/lib/api/concierge-route";

function request() {
  return new Request("https://isolated.example.test/api/ai/concierge", {
    method: "POST", headers: {origin: "https://isolated.example.test", "x-real-ip": "203.0.113.71", "content-type": "application/json"},
    body: JSON.stringify({message: "Synthetic membership question", locale: "zh-HK"}),
  });
}
function configure(secret: string | undefined, enabled = "true") {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("AGENTS_ENABLED", enabled);
  vi.stubEnv("APP_URL", "https://isolated.example.test");
  vi.stubEnv("CONCIERGE_COOKIE_SECRET", secret);
  vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "synthetic-auth-secret-".repeat(3));
  vi.stubEnv("OPENAI_API_KEY", "synthetic-provider-key");
  vi.stubEnv("TURNSTILE_SECRET", undefined);
  vi.stubEnv("TURNSTILE_SITE_KEY", undefined);
  for(const key of ["AI_BUDGET_RUN_MICROUSD","AI_BUDGET_DAY_MICROUSD","AI_BUDGET_MONTH_MICROUSD"])vi.stubEnv(key,"10000000");
}
beforeEach(() => {vi.spyOn(console, "warn").mockImplementation(() => undefined);});
afterEach(() => {vi.unstubAllEnvs(); vi.clearAllMocks(); vi.restoreAllMocks();});

describe("Concierge production readiness boundary", () => {
  it.each([{label: "absent", secret: undefined}, {label: "blank", secret: ""}, {label: "short", secret: "s".repeat(31)}])("missing_cookie_secret_returns_503_without_provider_or_database_calls ($label)", async ({secret}) => {
    configure(secret);
    const response = await POST(request());
    expect(response.status).toBe(503);
    const body: unknown = await response.json();
    expect(body).toEqual({error: "AI_CONFIGURATION_UNAVAILABLE", requestId: expect.any(String)});
    expect(JSON.stringify(body)).not.toMatch(/CONCIERGE_COOKIE_SECRET|synthetic-auth|synthetic-provider/);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(effects.service).not.toHaveBeenCalled();
    expect(effects.actor).not.toHaveBeenCalled();
    expect(effects.provider).not.toHaveBeenCalled();
    expect(effects.databaseWrite).not.toHaveBeenCalled();
  });
  it("rejects the Auth secret without starting a conversation", async () => {
    configure("synthetic-auth-secret-".repeat(3));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(effects.service).not.toHaveBeenCalled();
  });
  it("disabled is a manual fallback and does not claim an uncreated task", async () => {
    configure(undefined, "false");
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({error: "AI_DISABLED", requestId: expect.any(String)});
    expect(effects.service).not.toHaveBeenCalled();
    expect(effects.databaseWrite).not.toHaveBeenCalled();
  });
  it("accepts an independent secret by UTF-8 byte length at the existing boundary", async () => {
    configure("港".repeat(11));
    const response = await POST(request());
    expect(response.status).toBe(200);
    await response.text();
    expect(effects.service).toHaveBeenCalledOnce();
    expect(effects.databaseWrite).toHaveBeenCalledOnce();
  });
});

it("missing budget caps return safe 503 before actor, DB or provider work",async()=>{
 configure("independent-concierge-secret-".repeat(2));
 for(const key of ["AI_BUDGET_RUN_MICROUSD","AI_BUDGET_DAY_MICROUSD","AI_BUDGET_MONTH_MICROUSD"])vi.stubEnv(key,undefined);
 const response=await POST(request());expect(response.status).toBe(503);
 expect(await response.json()).toEqual({error:"AI_CONFIGURATION_UNAVAILABLE",requestId:expect.any(String)});
 expect(effects.actor).not.toHaveBeenCalled();expect(effects.provider).not.toHaveBeenCalled();expect(effects.databaseWrite).not.toHaveBeenCalled();
});

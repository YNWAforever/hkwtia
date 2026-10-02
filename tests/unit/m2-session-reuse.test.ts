import {describe, expect, it, vi} from "vitest";
import {reuseM2Session} from "@/tests/fixtures/m2-session-reuse";

function fixture(user: unknown, ok = true) {
  const addCookies = vi.fn(async () => undefined);
  const get = vi.fn(async (_path: string, _options?: {maxRedirects: number}) => ({ok: () => ok, json: async () => ({user})}));
  return {page: {context: () => ({addCookies}), request: {get}}, addCookies, get};
}
const cookies = [{name: "synthetic-session", value: "synthetic", domain: "localhost", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" as const}];
describe("isolated browser session reuse", () => {
  it("rejects a cached session when identity API succeeds but the protected server page redirects", async () => {
    const f=fixture({id:"synthetic-staff",email:"staff@example.test"});
    f.get.mockImplementation(async (path: string) => ({ok:()=>path==="/api/auth/get-session",json:async()=>({user:{id:"synthetic-staff",email:"staff@example.test"}})}));
    expect(await reuseM2Session(f.page,cookies,"staff@example.test","/admin")).toBe(false);
  });
  it("requires the server to confirm the same synthetic identity before reuse", async () => {
    const f = fixture({id: "synthetic-staff", email: "staff@example.test"});
    expect(await reuseM2Session(f.page, cookies, "staff@example.test", "/admin")).toBe(true);
    expect(f.addCookies).toHaveBeenCalledWith(cookies);
    expect(f.get).toHaveBeenCalledWith("/api/auth/get-session");
  });
  it("rejects a different identity even when a cookie exists", async () => {
    const f = fixture({id: "synthetic-member", email: "member@example.test"});
    expect(await reuseM2Session(f.page, cookies, "staff@example.test", "/admin")).toBe(false);
  });
  it("rejects expired or unavailable sessions without trusting the local artifact", async () => {
    for (const f of [fixture(null), fixture({id: "synthetic-staff", email: "staff@example.test"}, false)]) {
      expect(await reuseM2Session(f.page, cookies, "staff@example.test", "/admin")).toBe(false);
    }
  });
});

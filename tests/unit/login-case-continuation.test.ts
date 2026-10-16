import {describe, expect, it} from "vitest";
import {parseLoginDestination} from "@/lib/auth/login-destination";
const id = "1a538745-848b-448f-94d6-3b6a92f4e891";
describe("staff case continuation after authentication", () => {
  it("returns to the actual nested application case route", () => {
    const path = `/admin/members/queue/${id}`;
    expect(parseLoginDestination(path, "admin").path).toBe(path);
    expect(parseLoginDestination(path, "member").path).toBe("/portal");
  });
  it.each(["all", "mine", "unassigned", "overdue"])("preserves the validated inbox %s workspace scope", (scope) => {
    const path = `/admin/inbox?channel=web&handling=human&scope=${scope}`;
    expect(parseLoginDestination(path, "admin").path).toBe(path);
  });
  it.each([`/admin/members/queue/not-a-uuid`, `/admin/members/queue/${id}?role=superadmin`, "/admin/inbox?scope=other", "/admin/inbox?scope=mine&scope=all", "/admin/inbox?scope=https%3A%2F%2Fevil.example", "/admin/inbox?scope=mine%0A"])("still rejects unsafe or unsupported continuation %s", (path) => {
    expect(parseLoginDestination(path, "admin").path).toBe("/admin");
  });
});

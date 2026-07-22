import {readFileSync} from "node:fs";

import {describe, expect, it} from "vitest";

function actionSource(path: string, actionName: string, nextMarker: string): string {
  const source = readFileSync(path, "utf8");
  const start = source.indexOf("async function " + actionName);
  const end = source.indexOf(nextMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("client-bound event Server Actions", () => {
  it.each(["createEventAction", "updateEventAction", "checkInEventAttendeeAction"])("keeps %s in the top-level module without capturing a translator", (actionName) => {
    const source = readFileSync("lib/admin/event-actions.ts", "utf8");
    expect(source).toContain("export async function " + actionName);
    expect(source).not.toContain("getTranslations");
    expect(source).not.toMatch(/\bt\(/);
  });

  it.each([
    "app/[locale]/(admin)/admin/events-mgmt/page.tsx",
    "app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx",
  ])("binds serializable messages in %s", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).toContain(".bind(null,");
    expect(source).not.toContain('"use server"');
  });

  it("does not capture the next-intl translator in member RSVP", () => {
    expect(actionSource("app/[locale]/(member)/portal/events/page.tsx", "registerAction", "\n  return <div")).not.toMatch(/\bt\(/);
  });
});
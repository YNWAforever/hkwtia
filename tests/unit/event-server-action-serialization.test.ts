import {readFileSync} from "node:fs";

import {describe, expect, it} from "vitest";

function actionSource(path: string, actionName: string, nextMarker: string): string {
  const source = readFileSync(path, "utf8");
  const start = source.indexOf(`async function ${actionName}`);
  const end = source.indexOf(nextMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("client-bound event Server Actions", () => {
  it.each([
    ["admin create", "app/[locale]/(admin)/admin/events-mgmt/page.tsx", "createAction", "\n  const labels"],
    ["admin update", "app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx", "updateAction", "\n  async function checkInAction"],
    ["admin check-in", "app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx", "checkInAction", "\n  const labels"],
    ["member RSVP", "app/[locale]/(member)/portal/events/page.tsx", "registerAction", "\n  return <div"],
  ])("does not capture the next-intl translator in %s", (_label, path, actionName, nextMarker) => {
    expect(actionSource(path, actionName, nextMarker)).not.toMatch(/\bt\(/);
  });
});

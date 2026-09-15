import {readFileSync} from "node:fs";

import {expect, test} from "@playwright/test";

import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

type Bundle = Readonly<{
  Admin: Readonly<{
    checkIn: Readonly<{alreadyCheckedIn: string; checkIn: string; undo: string; checkInSuccess: string; undoSuccess: string}>;
    eventsMgmt: Readonly<{resendPass: string}>;
  }>;
  Pass: Readonly<{qrLabel: string}>;
}>;

const bundle = (locale: "en" | "zh-HK") =>
  JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as Bundle;

// Seat one carries the English case and seat two the Chinese one, so a failure
// that leaves a seat checked in cannot cascade into the other locale's case.
const cases = [
  {locale: "en" as const, prefix: "", passUrlVar: "D4B_PASS_URL_ONE", checkInUrlVar: "D4B_CHECK_IN_URL_ONE", seatName: "D4B Acceptance One"},
  {locale: "zh-HK" as const, prefix: "/zh", passUrlVar: "D4B_PASS_URL_TWO_ZH", checkInUrlVar: "D4B_CHECK_IN_URL_TWO_ZH", seatName: "D4B Acceptance Two"},
] as const;

const urlVars = cases.flatMap((testCase) => [testCase.passUrlVar, testCase.checkInUrlVar]);

// Every missing environment fact is named: a bare "requires acceptance env" can
// never be told apart from a feature that is actually broken.
const missing = [
  ...missingM2LiveEnvironment(),
  ...(process.env.D4B_ACCEPTANCE_SEED === "true" ? [] : ["D4B_ACCEPTANCE_SEED=true"]),
  ...urlVars.filter((name) => !process.env[name]?.trim()),
];

/**
 * Phase D-4b acceptance walk (spec 禮10, items 1–3): the door list shows the
 * seeded ticket seats, a signed-out visitor opens a pass and sees its QR, staff
 * scan into the check-in page and admit the seat, a second scan reports it as
 * already checked in, and Undo restores it.
 *
 * It writes, so it runs only against the isolated D-4b seed: `db:seed:d4b` prints
 * `D4B_PASS_URL_*` / `D4B_CHECK_IN_URL_*` at the end of its run because the walk
 * cannot sign a token it does not hold the secret for. Without those facts the
 * cases skip rather than fail, and the skip says exactly what was missing.
 */
test.describe("phase D-4b passes and check-in", () => {
  test.skip(missing.length > 0, `Requires ${missing.join(", ")}`);

  for (const testCase of cases) {
    test(`${testCase.locale}: a pass renders, admits once, reports the second scan, and is undone`, async ({browser}) => {
      const copy = bundle(testCase.locale);

      // 1. The door list shows the seeded ticket seat, with its resend control.
      const staffContext = await browser.newContext();
      const staffPage = await staffContext.newPage();
      await signInForM2(staffPage, "staff");
      await staffPage.goto(`${testCase.prefix}/admin/events-mgmt`);
      await staffPage.getByRole("link", {name: /d4b/i}).first().click();
      const seatRow = staffPage.locator("tr", {has: staffPage.getByRole("cell", {name: testCase.seatName})});
      await expect(seatRow).toHaveCount(1);
      await expect(seatRow.getByRole("button", {name: copy.Admin.eventsMgmt.resendPass, exact: true})).toBeVisible();

      // 2. The pass page renders the attendee, the event and a QR, signed out.
      const guestContext = await browser.newContext();
      const guestPage = await guestContext.newPage();
      await guestPage.goto(process.env[testCase.passUrlVar]!);
      await expect(guestPage.getByText(testCase.seatName)).toBeVisible();
      // Scoped to the QR's own labelled container: the public shell around the
      // pass carries its own icons, so a page-wide `svg` count would be a count
      // of the header, not of the pass.
      await expect(guestPage.getByRole("img", {name: copy.Pass.qrLabel}).locator("svg")).toHaveCount(1);

      // 3. Staff open the check-in URL from the QR and admit the seat.
      const checkInUrl = process.env[testCase.checkInUrlVar]!;
      await staffPage.goto(checkInUrl);
      await staffPage.getByRole("button", {name: copy.Admin.checkIn.checkIn, exact: true}).click();
      await expect(staffPage.getByRole("status")).toContainText(copy.Admin.checkIn.checkInSuccess);

      // 4. The second scan reports the seat is already checked in.
      await staffPage.goto(checkInUrl);
      await expect(staffPage.getByText(copy.Admin.checkIn.alreadyCheckedIn)).toBeVisible();
      await expect(staffPage.getByRole("button", {name: copy.Admin.checkIn.undo, exact: true})).toBeVisible();

      // 5. Undo restores the seat to admissible.
      await staffPage.getByRole("button", {name: copy.Admin.checkIn.undo, exact: true}).click();
      await expect(staffPage.getByRole("status")).toContainText(copy.Admin.checkIn.undoSuccess);
      await expect(staffPage.getByRole("button", {name: copy.Admin.checkIn.checkIn, exact: true})).toBeVisible();

      await staffContext.close();
      await guestContext.close();
    });
  }
});

import {readFileSync} from "node:fs";

import {expect, test} from "@playwright/test";

type LoginCopy = Readonly<{
  google: string;
  googleUnavailable: string;
  emailLabel: string;
  submit: string;
  sent: string;
  changeEmail: string;
  resend: string;
  waitSeconds: string;
  errors: Readonly<{auth: string}>;
}>;

function copy(locale: "en" | "zh-HK", intent: "member" | "admin"): LoginCopy {
  const bundle = JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as {
    MemberLogin: LoginCopy;
    AdminLogin: LoginCopy;
  };
  return intent === "member" ? bundle.MemberLogin : bundle.AdminLogin;
}

for (const locale of ["en", "zh-HK"] as const) {
  for (const intent of ["member", "admin"] as const) {
    const prefix = locale === "zh-HK" ? "/zh" : "";
    const route = `${prefix}/${intent}-login`;
    const destination = intent === "member" ? "/portal/billing" : "/admin/members";
    const labels = copy(locale, intent);

    test(`${locale} ${intent}: method readiness and safe continuation render`, async ({page}) => {
      const response = await page.goto(`${route}?next=${encodeURIComponent(destination)}`);
      expect(response?.status()).toBe(200);
      const form = page.getByTestId(`${intent}-login-form`);
      await expect(form).toBeVisible();
      await expect(form).toHaveAttribute("data-continuation", destination);
      await expect(page.getByRole("button", {name: labels.google, exact: true})).toBeDisabled();
      await expect(page.getByText(labels.googleUnavailable, {exact: true})).toBeVisible();
      await expect(form.getByLabel(labels.emailLabel, {exact: true})).toHaveAttribute("type", "email");
      await expect(form.getByRole("button", {name: labels.submit, exact: true})).toBeVisible();
    });

    test(`${locale} ${intent}: sent-state recovery keeps resend waiting`, async ({page}) => {
      await page.goto(`${route}?next=${encodeURIComponent(destination)}&sent=1&wait=45`);
      const form = page.getByTestId(`${intent}-login-form`);
      await expect(form).toHaveAttribute("data-continuation", destination);
      await expect(page.getByRole("status")).toContainText(labels.sent);
      await expect(form.getByRole("button", {name: labels.resend, exact: true})).toBeDisabled();
      await expect(page.getByText(labels.waitSeconds, {exact: false})).toBeVisible();
      await page.getByRole("link", {name: labels.changeEmail, exact: true}).click();
      await expect(page.getByRole("status")).toHaveCount(0);
      await expect(form.getByLabel(labels.emailLabel, {exact: true})).toBeEmpty();
    });

    test(`${locale} ${intent}: provider-error return offers email recovery`, async ({page}) => {
      await page.goto(`${route}?next=${encodeURIComponent(destination)}&error=access_denied`);
      await expect(page.getByRole("alert").filter({hasText: labels.errors.auth})).toBeVisible();
      await expect(page.getByTestId(`${intent}-login-form`)).toHaveAttribute("data-continuation", destination);
    });
  }
}

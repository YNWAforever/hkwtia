import {readFileSync} from "node:fs";

import {expect, test, type Page} from "@playwright/test";

type M3Messages = Readonly<{
  NotFound: {title: string};
  Unsubscribe: {
    confirmTitle: string;
    confirmAction: string;
    successTitle: string;
  };
  Admin: {
    automations: {title: string};
    member360: {
      journeys: string;
      whatsapp: string;
      suppressions: string;
    };
  };
}>;

function messages(locale: "en" | "zh-HK"): M3Messages {
  return JSON.parse(
    readFileSync(
      new URL(`../../messages/${locale}.json`, import.meta.url),
      "utf8",
    ),
  ) as M3Messages;
}

const en = messages("en");
const zh = messages("zh-HK");
const previewUrl = process.env.PLAYWRIGHT_BASE_URL?.trim();
const previewSkipReason =
  "M3 browser acceptance requires PLAYWRIGHT_BASE_URL for an isolated Preview.";

function missing(names: readonly string[]): readonly string[] {
  return names.filter((name) => !process.env[name]?.trim());
}

async function enterProtectedPreview(page: Page): Promise<void> {
  const shareToken = process.env.VERCEL_SHARE_TOKEN?.trim();
  if (!shareToken || !previewUrl) return;

  const shareUrl = new URL(previewUrl);
  if (
    shareUrl.protocol !== "https:"
    || !shareUrl.hostname.endsWith(".vercel.app")
  ) {
    throw new Error("VERCEL_SHARE_TOKEN_REQUIRES_HTTPS_VERCEL_PREVIEW");
  }
  shareUrl.searchParams.set("_vercel_share", shareToken);
  await page.goto(shareUrl.href);
}

async function signIn(
  page: Page,
  role: "staff" | "member",
): Promise<void> {
  const prefix = role === "staff" ? "M3_TEST_STAFF" : "M3_TEST_MEMBER";
  const email = process.env[`${prefix}_EMAIL`]?.trim();
  const password = process.env[`${prefix}_PASSWORD`]?.trim();
  if (!email || !password) {
    throw new Error(`${prefix}_EMAIL and ${prefix}_PASSWORD are required`);
  }

  await page.goto("/");
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: {
      email,
      password,
      callbackURL: role === "staff" ? "/admin/automations" : "/portal",
    },
    headers: {Origin: new URL(page.url()).origin},
  });
  expect(response.ok()).toBe(true);
}

test.beforeEach(async ({page}) => enterProtectedPreview(page));

test.describe("M3 authenticated automation Preview", () => {
  const required = [
    "M3_TEST_STAFF_EMAIL",
    "M3_TEST_STAFF_PASSWORD",
    "M3_TEST_MEMBER_EMAIL",
    "M3_TEST_MEMBER_PASSWORD",
  ] as const;
  const absent = missing(required);
  test.skip(!previewUrl, previewSkipReason);
  test.skip(
    absent.length > 0,
    `M3 authenticated Preview credentials are missing: ${absent.join(", ")}`,
  );

  test("staff sees the English and Traditional Chinese automation consoles", async ({
    page,
  }) => {
    await signIn(page, "staff");

    const english = await page.goto("/admin/automations");
    expect(english?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("heading", {level: 1, name: en.Admin.automations.title}),
    ).toBeVisible();

    const chinese = await page.goto("/zh/admin/automations");
    expect(chinese?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-HK");
    await expect(
      page.getByRole("heading", {level: 1, name: zh.Admin.automations.title}),
    ).toBeVisible();
  });

  test("staff sees seeded automation history in Member 360", async ({page}) => {
    await signIn(page, "staff");
    const response = await page.goto(
      "/admin/members/m3-marketing-unsubscribed",
    );
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: en.Admin.member360.journeys,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: en.Admin.member360.suppressions,
      }),
    ).toBeVisible();

    await page.goto("/admin/members/m3-renewal-whatsapp-opted-in");
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: en.Admin.member360.whatsapp,
      }),
    ).toBeVisible();
  });

  test("a member receives a real 404 for both automation console locales", async ({
    page,
  }) => {
    await signIn(page, "member");
    for (const route of [
      {path: "/admin/automations", title: en.NotFound.title},
      {path: "/zh/admin/automations", title: zh.NotFound.title},
    ]) {
      const response = await page.goto(route.path);
      expect(response?.status(), route.path).toBe(404);
      await expect(
        page.getByRole("heading", {level: 1, name: route.title}),
      ).toBeVisible();
    }
  });
});

test.describe("M3 unsubscribe confirmation Preview", () => {
  const tokenCases = [
    {
      locale: "en",
      path: "/unsubscribe",
      tokenName: "M3_TEST_UNSUBSCRIBE_TOKEN_EN",
      copy: en.Unsubscribe,
    },
    {
      locale: "zh-HK",
      path: "/zh/unsubscribe",
      tokenName: "M3_TEST_UNSUBSCRIBE_TOKEN_ZH_HK",
      copy: zh.Unsubscribe,
    },
  ] as const;

  test.skip(!previewUrl, previewSkipReason);

  for (const tokenCase of tokenCases) {
    test(`confirms marketing unsubscribe in ${tokenCase.locale}`, async ({
      page,
    }) => {
      const token = process.env[tokenCase.tokenName]?.trim();
      test.skip(
        !token,
        `${tokenCase.tokenName} is required for unsubscribe confirmation.`,
      );
      await page.goto(
        `${tokenCase.path}?token=${encodeURIComponent(token!)}`,
      );
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: tokenCase.copy.confirmTitle,
        }),
      ).toBeVisible();
      await page.getByRole(
        "button",
        {name: tokenCase.copy.confirmAction},
      ).click();
      await expect(page).toHaveURL(
        new RegExp(`${tokenCase.path.replace("/", "\\/")}\\?status=success$`),
      );
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: tokenCase.copy.successTitle,
        }),
      ).toBeVisible();
    });
  }
});

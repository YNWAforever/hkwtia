import {readFileSync} from "node:fs";

import {expect, test, type Page} from "@playwright/test";

type Messages = Readonly<{
  NotFound: {title: string};
  Admin: {
    approvals: {
      title: string;
      actionTypes: {retentionOutreach: string};
    };
    reports: {
      title: string;
      boardDraftsHeading: string;
      boardDraftPreview: string;
    };
  };
}>;

const messages = JSON.parse(
  readFileSync(new URL("../../messages/en.json", import.meta.url), "utf8"),
) as Messages;
const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim();

function validateTarget(value: string): URL {
  const target = new URL(value);
  if (
    target.username
    || target.password
    || target.search
    || target.hash
    || !["http:", "https:"].includes(target.protocol)
  ) {
    throw new Error("M4B_E2E_TARGET_INVALID");
  }
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"])
    .has(target.hostname.toLowerCase());
  if (loopback) return target;
  if (
    target.protocol !== "https:"
    || !target.hostname.endsWith(".vercel.app")
    || target.hostname === "hkwtia.vercel.app"
  ) {
    throw new Error("M4B_E2E_PREVIEW_TARGET_REQUIRED");
  }
  const allowedOrigin = process.env.M4B_E2E_ALLOWED_ORIGIN?.trim();
  if (allowedOrigin !== target.origin) {
    throw new Error("M4B_E2E_TARGET_ORIGIN_MISMATCH");
  }
  return target;
}

const target = configuredBaseUrl ? validateTarget(configuredBaseUrl) : null;
const requiredCredentials = [
  "M4B_TEST_STAFF_EMAIL",
  "M4B_TEST_STAFF_PASSWORD",
  "M4B_TEST_MEMBER_EMAIL",
  "M4B_TEST_MEMBER_PASSWORD",
] as const;
const missingCredentials = requiredCredentials.filter((name) =>
  !process.env[name]?.trim()
);

async function enterProtectedPreview(page: Page): Promise<void> {
  const shareToken = process.env.VERCEL_SHARE_TOKEN?.trim();
  if (!shareToken || !target || target.hostname === "localhost") return;
  const shareUrl = new URL(target.origin);
  shareUrl.searchParams.set("_vercel_share", shareToken);
  await page.goto(shareUrl.href);
}

async function signIn(
  page: Page,
  role: "staff" | "member",
): Promise<void> {
  const prefix = role === "staff" ? "M4B_TEST_STAFF" : "M4B_TEST_MEMBER";
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
      callbackURL: role === "staff" ? "/admin/approvals" : "/portal",
    },
    headers: {Origin: new URL(page.url()).origin},
  });
  expect(response.ok()).toBe(true);
}

test.beforeEach(async ({page}) => {
  await enterProtectedPreview(page);
});

test.describe("M4B staff-only agent outputs", () => {
  test.skip(
    !target,
    "M4B browser acceptance requires PLAYWRIGHT_BASE_URL for an isolated local or Preview target.",
  );
  test.skip(
    missingCredentials.length > 0,
    `M4B browser acceptance credentials are missing: ${
      missingCredentials.join(", ")
    }`,
  );

  test("staff sees three approval-only drafts and one inert board preview", async ({
    page,
  }) => {
    await signIn(page, "staff");

    const approvals = await page.goto("/admin/approvals");
    expect(approvals?.status()).toBe(200);
    await expect(page.getByRole("heading", {
      level: 1,
      name: messages.Admin.approvals.title,
    })).toBeVisible();
    await expect(page.getByText(
      messages.Admin.approvals.actionTypes.retentionOutreach,
      {exact: true},
    )).toHaveCount(3);
    await expect(page.getByRole("button", {
      name: /send|publish/i,
    })).toHaveCount(0);

    const reports = await page.goto(
      "/admin/reports?from=2030-06-01&to=2030-06-30",
    );
    expect(reports?.status()).toBe(200);
    await expect(page.getByRole("heading", {
      level: 1,
      name: messages.Admin.reports.title,
    })).toBeVisible();
    await expect(page.getByRole("heading", {
      level: 2,
      name: messages.Admin.reports.boardDraftsHeading,
    })).toBeVisible();
    const preview = page.getByRole("link", {
      name: messages.Admin.reports.boardDraftPreview,
    });
    await expect(preview).toHaveCount(1);
    await expect(page.getByRole("button", {
      name: /send|publish/i,
    })).toHaveCount(0);

    await preview.click();
    await expect(page.getByRole("heading", {
      level: 1,
      name: "Board report: 2030-06",
    })).toBeVisible();
    await expect(page.getByText("HKD 10,800", {exact: false})).toBeVisible();
    await expect(page.getByText("At-risk members", {exact: false}))
      .toBeVisible();
    await expect(page.getByRole("button", {
      name: /send|publish/i,
    })).toHaveCount(0);
  });

  test("member identities receive real 404s for both staff queues", async ({
    page,
  }) => {
    await signIn(page, "member");
    for (const route of ["/admin/approvals", "/admin/reports"]) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(404);
      await expect(page.getByRole("heading", {
        level: 1,
        name: messages.NotFound.title,
      })).toBeVisible();
    }
  });
});

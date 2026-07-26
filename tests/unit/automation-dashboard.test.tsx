import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {
  AutomationDashboardView,
  type RetryAutomationAction,
} from "@/components/admin/automation-dashboard";
import {Member360View} from "@/components/admin/member-360";
import type {AutomationDashboard} from "@/lib/admin/automations";
import type {Member360} from "@/lib/admin/member-360";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

const dashboard: AutomationDashboard = {
  asOf: "2027-01-15T10:00:00.000Z",
  counts: {due: 2, upcoming: 3, failed: 1, processing: 4},
  jobs: [{
    id: "44444444-4444-4444-8444-444444444444",
    kind: "journey-runner",
    state: "failed",
    updatedAt: "2027-01-15T09:59:00.000Z",
    errorCode: "JOB_RUN_FAILED",
  }],
  rows: [{
    id: "11111111-1111-4111-8111-111111111111",
    journey: "renewal",
    step: "renewal_14",
    status: "failed",
    scheduledAt: "2027-01-15T09:00:00.000Z",
    attemptCount: 3,
    errorCode: "provider_client_error",
    retryable: true,
  }, {
    id: "22222222-2222-4222-8222-222222222222",
    journey: "onboarding_90d",
    step: "welcome",
    status: "sent",
    scheduledAt: "2027-01-14T09:00:00.000Z",
    attemptCount: 1,
    errorCode: null,
    retryable: false,
  }],
  nextCursor: "opaque-next-cursor",
};

const retryAction: RetryAutomationAction = async () => ({
  status: "success",
  code: "scheduled",
});

const member360 = {
  profile: {
    id: "member-1",
    displayName: "Ada Wong",
    email: "ada@example.test",
    phone: "+85260000000",
    role: "member",
  },
  companies: [],
  membership: null,
  engagement: {score: 18, trend: -2, events: []},
  emails: [],
  events: [],
  notes: [],
  journeys: [{
    id: "journey-1",
    journey: "renewal",
    step: "renewal_14",
    status: "failed",
    scheduledAt: "2027-01-15T09:00:00.000Z",
    attemptCount: 3,
    errorCode: "provider_client_error",
  }],
  whatsapp: [{
    id: "whatsapp-1",
    template: "renewal-reminder",
    status: "failed",
    locale: "zh-HK",
    classification: "transactional",
    attemptCount: 2,
    errorCode: "provider_client_error",
    createdAt: "2027-01-15T08:00:00.000Z",
    providerId: "provider-secret",
  }],
  suppressions: [{
    id: "suppression-1",
    channel: "whatsapp",
    classification: "marketing",
    reasonCode: "opt_out",
    createdAt: "2027-01-14T08:00:00.000Z",
  }],
} as unknown as Member360;

describe("automation dashboard presentation", () => {
  it.each([
    {
      locale: "en" as const,
      labels: en.Admin.automations,
      title: "Automation operations",
      nav: "Automations",
    },
    {
      locale: "zh-HK" as const,
      labels: zh.Admin.automations,
      title: "\u81ea\u52d5\u5316\u71df\u904b",
      nav: "\u81ea\u52d5\u5316",
    },
  ])("renders the exact localized headings and semantic operations tables in $locale", ({
    locale,
    labels,
    title,
    nav,
  }) => {
    const html = renderToStaticMarkup(
      <AutomationDashboardView
        action={retryAction}
        dashboard={dashboard}
        labels={labels}
        locale={locale}
      />,
    );

    expect(labels.title).toBe(title);
    expect(locale === "en"
      ? en.Admin.navigation.automations
      : zh.Admin.navigation.automations).toBe(nav);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(`>${title}</h1>`);
    expect(html).toContain(`<caption>${labels.jobsCaption}</caption>`);
    expect(html).toContain(`<caption>${labels.queueCaption}</caption>`);
    expect(html.match(/<table/g)).toHaveLength(2);
    expect(html).toContain("<thead");
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect(html).toContain("<dl");
    expect(html).toContain(labels.due);
    expect(html).toContain(">2<");
    expect(html).toContain(labels.upcoming);
    expect(html).toContain(">3<");
    expect(html).toContain(labels.failed);
    expect(html).toContain(">1<");
    expect(html).toContain(labels.processing);
    expect(html).toContain(">4<");
    expect(html).toContain(`name="journeyId"`);
    expect(html).toContain(`value="${dashboard.rows[0]!.id}"`);
    expect(html.match(/name="journeyId"/g)).toHaveLength(1);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("cursor=opaque-next-cursor");
  });

  it("renders only sanitized operational fields", () => {
    const html = renderToStaticMarkup(
      <AutomationDashboardView
        action={retryAction}
        dashboard={dashboard}
        labels={en.Admin.automations}
        locale="en"
      />,
    );

    expect(html).toContain("journey-runner");
    expect(html).toContain("JOB_RUN_FAILED");
    expect(html).toContain("provider_client_error");
    expect(html).not.toContain("member@example.test");
    expect(html).not.toContain("+85260000000");
    expect(html).not.toContain("provider-secret");
    expect(html).not.toContain("message body");
    expect(html).not.toContain("secret-token");
  });

  it("keeps the page server-rendered, authenticates before parsing query data, and uses the shared 404 boundary", () => {
    const page = readFileSync(resolve(
      process.cwd(),
      "app/[locale]/(admin)/admin/automations/page.tsx",
    ), "utf8");
    const component = readFileSync(resolve(
      process.cwd(),
      "components/admin/automation-dashboard.tsx",
    ), "utf8");
    const authorization = page.indexOf(
      "const actor = await requireAdminPageActor();",
    );
    const query = page.indexOf("await searchParams");

    expect(page).toContain(
      'import {requireAdminPageActor} from "@/lib/admin/page-auth";',
    );
    expect(authorization).toBeGreaterThanOrEqual(0);
    expect(query).toBeGreaterThan(authorization);
    expect(page).toContain("getAutomationDashboard(actor");
    expect(page).not.toContain('"use client"');
    expect(component).not.toContain('"use client"');
    expect(component).not.toContain("fetch(");
    expect(component).not.toContain("useEffect");
  });

  it.each([
    {labels: en.Admin.member360, locale: "en" as const},
    {labels: zh.Admin.member360, locale: "zh-HK" as const},
  ])("renders sanitized Member360 automation history in $locale", ({labels, locale}) => {
    const html = renderToStaticMarkup(
      <Member360View
        labels={labels}
        locale={locale}
        stripeCustomerHref={null}
        stripeSubscriptionHref={null}
        view={member360}
      />,
    );

    expect(html).toContain(`>${labels.journeys}</h2>`);
    expect(html).toContain(`>${labels.whatsapp}</h2>`);
    expect(html).toContain(`>${labels.suppressions}</h2>`);
    expect(html).toContain("renewal_14");
    expect(html).toContain("renewal-reminder");
    expect(html).toContain("opt_out");
    expect(html).not.toContain("provider-secret");

    const formatter = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Hong_Kong",
    });
    for (const timestamp of [
      member360.journeys[0]!.scheduledAt,
      member360.whatsapp[0]!.createdAt,
      member360.suppressions[0]!.createdAt,
    ]) {
      expect(html).toContain(formatter.format(new Date(timestamp)));
      expect(html).not.toContain(`>${timestamp}</time>`);
    }
  });
});

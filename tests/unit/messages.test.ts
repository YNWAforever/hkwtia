import {createTranslator} from 'next-intl';
import en from '@/messages/en.json';
import zh from '@/messages/zh-HK.json';
import {describe, expect, it} from 'vitest';

type MessageTree = Record<string, unknown>;

function collectLeafEntries(value: unknown, prefix = ''): Array<[string, string]> {
  if (typeof value === 'string') return prefix ? [[prefix, value]] : [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];

  return Object.entries(value as MessageTree).flatMap(([key, child]) => {
    if (key.startsWith('_')) return [];
    return collectLeafEntries(child, prefix ? `${prefix}.${key}` : key);
  });
}

function collectLeafKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value as MessageTree).flatMap(([key, child]) => {
    if (key.startsWith('_')) return [];
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    return collectLeafKeys(child, nextPrefix);
  });
}

describe('message bundles', () => {
  it('keep English and Traditional Chinese leaf keys in parity', () => {
    const englishKeys = collectLeafKeys(en).sort();
    const chineseKeys = collectLeafKeys(zh).sort();

    expect(chineseKeys).toEqual(englishKeys);
    expect(zh._review).toBe(true);
  });

  it('uses localized example placeholders with an ellipsis', () => {
    expect(en.Concierge.placeholder).toMatch(/^e\.g\. .+…$/);
    expect(zh.Concierge.placeholder).toMatch(/^例如：.+…$/);
    expect(en.Concierge.contactEmailHelper).toMatch(/only if/i);
    expect(zh.Concierge.contactEmailHelper).toContain("只會");
    expect(en.Concierge.contactEmailError).toMatch(/valid email/i);
    expect(zh.Concierge.contactEmailError).toContain("有效");
  });


  it("ships complete bilingual WiseTech shell labels", () => {
    expect(en.Navigation.groups).toEqual({
      eventsProgrammes: expect.objectContaining({label: "Events & Programmes"}),
      membershipEcosystem: expect.objectContaining({label: "Membership & Ecosystem"}),
      impactInsights: expect.objectContaining({label: "Impact & Insights"}),
      aboutWtia: expect.objectContaining({label: "About WTIA"}),
    });
    expect(zh.Navigation.groups).toEqual({
      eventsProgrammes: expect.objectContaining({label: "活動及計劃"}),
      membershipEcosystem: expect.objectContaining({label: "會員與創科生態"}),
      impactInsights: expect.objectContaining({label: "影響與洞察"}),
      aboutWtia: expect.objectContaining({label: "關於 WTIA"}),
    });
    expect(en.Navigation.actions).toEqual({
      findEvent: "Find an event",
      join: "Join WiseTech",
      memberSignIn: "Member sign in",
    });
    expect(zh.Navigation.actions).toEqual({
      findEvent: "尋找活動",
      join: "加入 WiseTech",
      memberSignIn: "會員登入",
    });
  });
  it.each([en.Admin, zh.Admin])('includes equivalent retention approval and Board Reporter draft labels', (admin) => {
    expect(admin.approvals.actionTypes.retentionOutreach).toBeTruthy();
    expect(admin.approvals.subject).toBeTruthy();
    expect(admin.approvals.body).toBeTruthy();
    expect(admin.approvals.memberReference).toBeTruthy();
    expect(admin.approvals.locale).toBeTruthy();
    expect(admin.approvals.agentRunReference).toBeTruthy();
    expect(admin.approvals.reasons).toBeTruthy();
    expect(admin.approvals.reasonCodes.lowScoreDeclining).toBeTruthy();
    expect(admin.approvals.reasonCodes.inactiveBeforeRenewal).toBeTruthy();
    expect(admin.reports.boardDraftsHeading).toBeTruthy();
    expect(admin.reports.boardDraftsDescription).toBeTruthy();
    expect(admin.reports.boardDraftsEmpty).toBeTruthy();
    expect(admin.reports.boardDraftPreview).toBeTruthy();
    expect(admin.reports.boardDraftReportMonth).toBeTruthy();
    expect(admin.reports.boardDraftAgentRunStatus).toBeTruthy();
    expect(admin.reports.boardDraftPreviewEyebrow).toBeTruthy();
    expect(admin.reports.boardDraftPreviewDescription).toBeTruthy();
    expect(admin.reports.boardDraftBack).toBeTruthy();
    expect(Object.keys(admin.reports.boardDraftStatuses).sort()).toEqual([
      'completed', 'disabled', 'escalated', 'failed', 'running',
    ]);
    for (const status of Object.values(admin.reports.boardDraftStatuses)) {
      expect(status).toBeTruthy();
    }
    expect(en.Admin.reports.boardDraftKpi).toBe("KPI");
    expect(en.Admin.reports.boardDraftValue).toBe("Value");
    expect(zh.Admin.reports.boardDraftKpi).toBe("關鍵績效指標");
    expect(zh.Admin.reports.boardDraftValue).toBe("數值");
  });

  // The bundles carry ICU plurals, which next-intl formats through
  // intl-messageformat rather than a plain substitution. A malformed one throws
  // only when the page renders, so format every plural here instead.
  it.each([['en', en] as const, ['zh-HK', zh] as const])(
    'formats every %s ICU plural for zero, one, and many',
    (locale, messages) => {
      const plurals = collectLeafEntries(messages)
        .filter(([, value]) => value.includes(', plural,'));

      expect(plurals.length).toBeGreaterThan(0);
      for (const [path] of plurals) {
        const namespace = path.slice(0, path.lastIndexOf('.'));
        const key = path.slice(path.lastIndexOf('.') + 1);
        // Namespaces and keys are discovered from the bundle at runtime, so
        // next-intl's compile-time key types cannot describe this call.
        const t = createTranslator({
          locale, messages, namespace: namespace as never,
        }) as unknown as (key: string, values: Record<string, number>) => string;
        for (const count of [0, 1, 2, 11]) {
          expect(t(key, {count}), `${locale} ${path} @ ${count}`).toBeTruthy();
        }
      }
    },
  );
});
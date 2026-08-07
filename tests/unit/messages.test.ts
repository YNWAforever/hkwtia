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

  // The whole Admin.segments namespace once shipped as literal ASCII question
  // marks — "?? CSV", "????", a 29-character run of "?" — from M2 until it was
  // found by inspection. Every test passed throughout, because leaf-key parity
  // says nothing about whether a Chinese value contains Chinese.
  //
  // Arrays are walked here deliberately: collectLeafEntries above skips them,
  // so Privacy.sections.0.body.0 and its siblings would otherwise be exempt.
  function everyLeaf(value: unknown, prefix = ''): Array<[string, string]> {
    if (typeof value === 'string') return prefix ? [[prefix, value]] : [];
    if (value === null || typeof value !== 'object') return [];
    if (Array.isArray(value)) {
      return value.flatMap((child, index) => everyLeaf(child, `${prefix}.${index}`));
    }
    return Object.entries(value as MessageTree).flatMap(([key, child]) => {
      if (key.startsWith('_')) return [];
      return everyLeaf(child, prefix ? `${prefix}.${key}` : key);
    });
  }

  // Values that are legitimately Latin. The allowlist is the point: adding to it
  // should be a deliberate, reviewed act rather than a silent exemption.
  const latinByDesign = new Set([
    'Navigation.switchToEnglish',  // the language switcher must read as English
    'Navigation.logoAlt',
    'Email.brand',
    'Admin.brand',
    'Home.programs.cpai.title',
    'Home.programs.tct.title',
    'programs.cpai.title',
    'programs.tct.title',
    'Privacy.sections.5.heading',  // "WTIA Concierge", a product name
    'Concierge.characterCount',    // "{count} / 2000"
    'Navigation.english',          // the "EN" half of the language toggle
    // Architecture-diagram nodes that are product names. The approved
    // AiOps.architectureDescription keeps "Concierge runtime" in English too.
    'AiOps.architectureConciergeRuntime',
    'AiOps.architectureWorker',
    'AiOps.architectureDatabase',
  ]);

  it('walks array leaves too, so no branch of the tree is exempt', () => {
    const paths = everyLeaf(zh).map(([path]) => path);

    expect(paths).toContain('Privacy.sections.0.body.0');
    expect(paths.length).toBeGreaterThanOrEqual(1_100);
  });

  it('every Traditional Chinese value actually contains Chinese', () => {
    const missing = everyLeaf(zh)
      .filter(([path]) => !latinByDesign.has(path))
      // Only Latin *prose* is suspect. A bare numeral like Home.stats.0.value
      // ("4") needs no translation, and allowlisting each one would rot as the
      // numbers change.
      .filter(([, value]) => /[A-Za-z]/.test(value) && !/[\u4e00-\u9fff]/.test(value))
      .map(([path, value]) => `${path} = ${JSON.stringify(value)}`);

    expect(
      missing,
      'These zh-HK values contain no Chinese. Either translate them, or add the '
      + 'key to latinByDesign with a comment saying why it is Latin on purpose.',
    ).toEqual([]);
  });

  it('no value contains a run of ASCII question marks', () => {
    const corrupted = everyLeaf(zh)
      .filter(([, value]) => /\?{2,}/.test(value))
      .map(([path, value]) => `${path} = ${JSON.stringify(value)}`);

    expect(
      corrupted,
      'A run of "?" is the signature of a lossy encoding round-trip that '
      + 'replaced Chinese characters. No legitimate string needs one.',
    ).toEqual([]);
  });

  it('ships no internal bookkeeping key to the browser at any depth', () => {
    // The root flag is stripped by i18n/request.ts, but a nested Concierge._review
    // was reaching the serialized payload of every zh page.
    function underscored(value: unknown, prefix = ''): string[] {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];
      return Object.entries(value as MessageTree).flatMap(([key, child]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        return [...(key.startsWith('_') ? [path] : []), ...underscored(child, path)];
      });
    }

    // Exactly one, at the root, where i18n/request.ts and the reviewer expect it.
    expect(underscored(zh)).toEqual(['_review']);
    expect(underscored(en)).toEqual([]);
  });
});
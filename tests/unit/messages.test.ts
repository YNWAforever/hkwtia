import en from '@/messages/en.json';
import zh from '@/messages/zh-HK.json';
import {describe, expect, it} from 'vitest';

type MessageTree = Record<string, unknown>;

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
    expect(admin.approvals.reasons).toBeTruthy();
    expect(admin.approvals.reasonCodes.lowScoreDeclining).toBeTruthy();
    expect(admin.approvals.reasonCodes.inactiveBeforeRenewal).toBeTruthy();
    expect(admin.reports.boardDraftsHeading).toBeTruthy();
    expect(admin.reports.boardDraftsDescription).toBeTruthy();
    expect(admin.reports.boardDraftsEmpty).toBeTruthy();
    expect(admin.reports.boardDraftPreview).toBeTruthy();
  });
});

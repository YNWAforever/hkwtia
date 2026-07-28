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
  });
});

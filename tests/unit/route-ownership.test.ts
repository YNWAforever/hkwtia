import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const root = process.cwd();
const dedicated = [
  'programs/cpai', 'programs/hkict', 'programs/tct', 'programs/asa',
  'launchpad', 'showcase', 'ai-ops'
];

describe('M0 route ownership', () => {
  it('uses dedicated pages and removes the temporary catch-all', () => {
    for (const route of dedicated) {
      expect(existsSync(join(root, 'app/[locale]/(public)', route, 'page.tsx'))).toBe(true);
    }
    expect(existsSync(join(root, 'app/[locale]/(public)/[...slug]/page.tsx'))).toBe(false);
  });
});

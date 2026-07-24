import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

import {describe, expect, it} from 'vitest';

import {M2_LIVE_ENV_NAMES} from '../fixtures/m2-runtime-env';

const acceptanceDocument = readFileSync(
  resolve(process.cwd(), 'docs/m2-acceptance.md'),
  'utf8'
);

const requiredRuntimeMappings = [
  ['DATABASE_URL_TEST', 'DATABASE_URL'],
  ['STRIPE_TEST_SECRET_KEY', 'STRIPE_SECRET_KEY'],
  ['STRIPE_TEST_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_SECRET'],
  ['STRIPE_TEST_STARTUP_PRICE_ID', 'STRIPE_STARTUP_PRICE_ID'],
  ['STRIPE_TEST_CORPORATE_PRICE_ID', 'STRIPE_CORPORATE_PRICE_ID']
] as const;

describe('M2 preview environment documentation contract', () => {
  it('lists every M2 live environment name and its runtime mappings', () => {
    expect(M2_LIVE_ENV_NAMES).toHaveLength(16);
    expect(acceptanceDocument).toContain('all sixteen M2 preview environment names');

    for (const environmentName of M2_LIVE_ENV_NAMES) {
      expect(acceptanceDocument).toContain(`\`${environmentName}\``);
    }

    for (const [sourceName, runtimeName] of requiredRuntimeMappings) {
      expect(acceptanceDocument).toContain(`\`${sourceName}\` to \`${runtimeName}\``);
    }
  });

  it('instructs operators to configure all sixteen test-only preview names', () => {
    expect(acceptanceDocument).toContain(
      'configure all sixteen acceptance names with test-only values'
    );
  });
});

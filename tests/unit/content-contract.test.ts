import {describe, expect, it} from 'vitest';

import {publicRoutes} from '@/config/public-routes';
import {events} from '@/content/events';
import {programs} from '@/content/programs';
import {eventSchema, programSchema} from '@/content/schemas';

describe('public content contract', () => {
  it('has unique static paths and valid dynamic records', () => {
    expect(new Set(publicRoutes).size).toBe(publicRoutes.length);
    expect(publicRoutes).toContain('/membership');
    expect(() => eventSchema.array().parse(events)).not.toThrow();
    expect(programs.map(({id}) => id)).toEqual(['cpai', 'hkict', 'tct', 'asa']);
  });

  it('requires complete program identities', () => {
    expect(() =>
      programSchema.parse({
        id: 'cpai',
        namespace: 'programs.cpai',
        image: '/programs/cpai.jpg'
      })
    ).not.toThrow();
    expect(() => programSchema.parse({id: 'unknown'})).toThrow();
  });

  it('parses every programme record module', async () => {
    const records = await Promise.all([
      import('@/content/programs/asa'),
      import('@/content/programs/hkict'),
      import('@/content/programs/cpai'),
      import('@/content/programs/tct')
    ]);
    // Each module parses at import time, so reaching here means all four are
    // valid; this pins that all four are actually wired up and reachable.
    expect(records).toHaveLength(4);
  });
});

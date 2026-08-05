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
});

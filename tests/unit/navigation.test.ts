import {describe, expect, it} from 'vitest';

import {navigationItems} from '@/config/navigation';

describe('navigation', () => {
  it('uses route identifiers and translation keys without visible labels', () => {
    expect(navigationItems).toEqual([
      {href: '/about', labelKey: 'about'},
      {href: '/membership', labelKey: 'membership'},
      {href: '/showcase', labelKey: 'showcase'},
      {href: '/launchpad', labelKey: 'launchpad'},
      {href: '/events', labelKey: 'events'},
      {href: '/news', labelKey: 'news'}
    ]);
  });
});

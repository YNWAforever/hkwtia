import type {getTranslations} from 'next-intl/server';

import type {LegacyNetworkCategory} from '@/lib/home/legacy-network-groups';

export type LegacyNetworkLabels = Readonly<{
  eyebrow: string;
  title: string;
  note: string;
  viewAllAction: string;
  previewNote: string;
  tabs: Readonly<Record<LegacyNetworkCategory, string>>;
}>;

// Same rationale as lib/home/ecosystem-industries.ts's buildEcosystemIndustries/buildEcosystemLabels
// for the sibling section: shapes the `labels` prop the 'use client' LegacyNetwork component
// expects, out of page.tsx's JSX, from a real `t` from getTranslations (Home.legacyNetwork
// namespace).
export function buildLegacyNetworkLabels(t: Awaited<ReturnType<typeof getTranslations>>): LegacyNetworkLabels {
  return {
    eyebrow: t('eyebrow'),
    title: t('title'),
    note: t('note'),
    viewAllAction: t('viewAllAction'),
    // Raw, not translated: the {shown}/{total} placeholders are filled in client-side by
    // LegacyNetwork itself (Task 13), the same pattern Footer.newsletter.mailBody uses for
    // {email} -- a function cannot cross the server/client boundary as a prop, so the
    // template string does instead.
    previewNote: t.raw('previewNote') as string,
    tabs: {
      supporting: t('tabs.supporting'),
      regional: t('tabs.regional'),
      media: t('tabs.media'),
    },
  };
}

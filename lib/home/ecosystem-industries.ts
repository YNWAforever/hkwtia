// D-4: "Enter this ecosystem" links to /showcase?category=<industry> (a real, unvalidated
// filter -- lib/showcase/contracts.ts's category is a free-form string); education routes to
// /events and responsible-ai to /ai-transparency instead, per D-4's own carve-outs.
export type EcosystemIndustryKey = 'commerce' | 'manufacturing' | 'health' | 'responsibleAi' | 'retail' | 'education';
export type EcosystemIndustryView = Readonly<{key: EcosystemIndustryKey; signal: string; href: string; name: string; brief: string}>;

const industries: readonly Readonly<{key: EcosystemIndustryKey; signal: string; href: string}>[] = [
  {key: 'commerce', signal: '01', href: '/showcase?category=commerce-professional-services'},
  {key: 'manufacturing', signal: '02', href: '/showcase?category=manufacturing-robotics'},
  {key: 'health', signal: '03', href: '/showcase?category=health-life-sciences'},
  {key: 'responsibleAi', signal: '04', href: '/ai-transparency'},
  {key: 'retail', signal: '05', href: '/showcase?category=retail-creative-industries'},
  {key: 'education', signal: '06', href: '/events'},
];

// Server-safe: called from page.tsx (Task 15) with a real `t` from getTranslations, and here
// in the test with a stub. The 'use client' Ecosystem component cannot call this itself --
// a client module's plain exports cannot safely be invoked from server render code.
export function buildEcosystemIndustries(t: (key: string) => string): readonly EcosystemIndustryView[] {
  return industries.map((industry) => ({
    ...industry,
    name: t(`items.${industry.key}.name`),
    brief: t(`items.${industry.key}.brief`),
  }));
}

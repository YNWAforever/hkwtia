import type {MilestoneRecord} from "@/content/schemas";

export type MilestoneYear = Readonly<{
  year: number;
  milestones: readonly MilestoneRecord[];
}>;

/**
 * Groups newest year first. Years with no entries are absent rather than empty:
 * eight of the twenty-five have no surviving post, and rendering them as blank
 * rows advertises the gap instead of the record.
 */
export function byYearDescending(
  milestones: readonly MilestoneRecord[],
): readonly MilestoneYear[] {
  const groups = new Map<number, MilestoneRecord[]>();
  for (const milestone of milestones) {
    const existing = groups.get(milestone.year);
    if (existing) existing.push(milestone);
    else groups.set(milestone.year, [milestone]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, entries]) => ({year, milestones: entries}));
}

export function featuredOnly(
  milestones: readonly MilestoneRecord[],
): readonly MilestoneRecord[] {
  return milestones.filter(({featured}) => featured);
}

export function findBySlug(
  milestones: readonly MilestoneRecord[],
  slug: string,
): MilestoneRecord | null {
  return milestones.find((milestone) => milestone.slug === slug) ?? null;
}

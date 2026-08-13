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

/**
 * The captured archive holds three post kinds under one shape (see
 * milestoneSchema's `kind` comment): WTIA's own record, "Meet Our Member"
 * interviews, and republished vendor press releases. The interviews belong
 * on /showcase and the press releases on /news (Task 10 redirects each kind
 * to its real home) -- neither is WTIA's own institutional history, so this
 * page's timeline must not render them alongside actual milestones.
 */
export function milestonesOnly(
  milestones: readonly MilestoneRecord[],
): readonly MilestoneRecord[] {
  return milestones.filter(({kind}) => kind === "milestone");
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

export type ShowcaseViewTracker = Readonly<{
  record: (slug: string, viewerKey: string) => Promise<boolean>;
}>;

export type ShowcaseViewTrackerDependencies = Readonly<{
  now?: () => number;
  debounceMs: number;
  record: (slug: string) => Promise<void>;
  maxEntries?: number;
}>;

export function createShowcaseViewTracker(
  dependencies: ShowcaseViewTrackerDependencies,
): ShowcaseViewTracker {
  if (!Number.isSafeInteger(dependencies.debounceMs) || dependencies.debounceMs < 1) {
    throw new Error("SHOWCASE_VIEW_DEBOUNCE_INVALID");
  }
  const now = dependencies.now ?? Date.now;
  const maxEntries = dependencies.maxEntries ?? 2_000;
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
    throw new Error("SHOWCASE_VIEW_MAX_ENTRIES_INVALID");
  }
  const marks = new Map<string, number>();

  function cleanup(current: number): void {
    const expiry = current - dependencies.debounceMs;
    for (const [key, timestamp] of marks) {
      if (timestamp <= expiry) marks.delete(key);
    }
    while (marks.size > maxEntries) {
      const first = marks.keys().next().value;
      if (typeof first !== "string") break;
      marks.delete(first);
    }
  }

  return Object.freeze({
    async record(slug: string, viewerKey: string): Promise<boolean> {
      if (!slug || !viewerKey) return false;
      const current = now();
      const key = `${slug}:${viewerKey}`;
      const previous = marks.get(key);
      if (previous !== undefined && current - previous >= 0 && current - previous < dependencies.debounceMs) {
        return false;
      }
      await dependencies.record(slug);
      marks.set(key, current);
      cleanup(current);
      return true;
    },
  });
}

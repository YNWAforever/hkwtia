type SluggedRecord = Readonly<{slug: string}>;

export function withoutStaticNewsSlugCollisions<T extends SluggedRecord>(
  buildLogs: readonly T[],
  staticNews: readonly SluggedRecord[],
): readonly T[] {
  const staticSlugs = new Set(staticNews.map(({slug}) => slug));
  return buildLogs.filter(({slug}) => !staticSlugs.has(slug));
}

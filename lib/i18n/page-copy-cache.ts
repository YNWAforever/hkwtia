import "server-only";
import {unstable_cache, revalidateTag} from "next/cache";
import type {PageCopyOverride} from "@/lib/i18n/apply-page-copy";

const readPublicCopy = unstable_cache(async (locale: string): Promise<readonly PageCopyOverride[]> => {
  const {listPageCopyForLocale} = await import("@/lib/db/repos/page-copy");
  return listPageCopyForLocale(locale);
}, ["public-page-copy-v1"], {tags: ["public-page-copy"], revalidate: 30});

/** Public allowlisted copy only. No request headers, session, actor or private rows. */
export async function pageCopyOverrides(locale: string): Promise<readonly PageCopyOverride[]> {
  try { return await readPublicCopy(locale); }
  // A missing build-time database or failed read falls back WITHOUT caching failure.
  catch { return []; }
}

/** Called after the bilingual CMS transaction; expires all instances/locales. */
export function clearPageCopyCache(): void {
  revalidateTag("public-page-copy", {expire: 0});
}

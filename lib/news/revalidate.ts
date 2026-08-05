import {revalidatePath} from "next/cache";

import {routing} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Invalidates the public surfaces a news edit can change. Slugs come from a
 * validated row rather than the request, but they are re-checked here so this
 * helper is safe to call from anywhere.
 */
export function revalidatePublicNews(...slugs: readonly (string | null | undefined)[]): void {
  for (const locale of routing.locales) {
    revalidatePath(localizedPath(locale, "/news"));
    for (const slug of new Set(slugs)) {
      if (typeof slug !== "string" || !slugPattern.test(slug)) continue;
      revalidatePath(localizedPath(locale, `/news/${slug}`));
    }
  }
  revalidatePath("/sitemap.xml");
}

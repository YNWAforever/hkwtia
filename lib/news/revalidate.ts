import {revalidatePath, revalidateTag} from "next/cache";

import {routing} from "@/i18n/routing";


const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Invalidates the public surfaces a news edit can change. Slugs come from a
 * validated row rather than the request, but they are re-checked here so this
 * helper is safe to call from anywhere.
 */
export function revalidatePublicNews(...slugs: readonly (string | null | undefined)[]): void {
  revalidateTag("public-news", {expire: 0});
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}/news`);
    for (const slug of new Set(slugs)) {
      if (typeof slug !== "string" || !slugPattern.test(slug)) continue;
      revalidatePath(`/${locale}/news/${slug}`);
    }
  }
  revalidatePath("/sitemap.xml");
}

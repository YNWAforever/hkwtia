import {describe, expect, it} from "vitest";

import LaunchPadPage, {generateMetadata} from "@/app/[locale]/(public)/launchpad/page";

describe("Launch Pad page", () => {
  it.each(["en", "zh-HK"] as const)("is hidden in %s and asks crawlers not to index it", async (locale) => {
    await expect(LaunchPadPage({params: Promise.resolve({locale})})).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK|NEXT_NOT_FOUND/);
    await expect(generateMetadata({params: Promise.resolve({locale})})).resolves.toEqual({
      robots: {index: false, follow: false},
    });
  });
});

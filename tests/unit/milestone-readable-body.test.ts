import {describe, expect, it} from "vitest";

import {milestones} from "@/content/milestones";
import {readableMilestoneBody} from "@/lib/history/readable-body";

describe("readableMilestoneBody", () => {
  it("drops WordPress pdf-embedder shortcodes and the empty paragraphs they leave", () => {
    const body = 'Presentation Deck:\n\n[pdf-embedder url=”/wp-content/uploads/2020/09/Keith-Li-Brief-intro-to-UX”]\n\n[pdf-embedder url=”/wp-content/uploads/2020/09/Deck_UIUX_MoreThanYouThink_V4″]';
    expect(readableMilestoneBody(body)).toEqual(["Presentation Deck:"]);
  });

  it("keeps ordinary prose, brackets included, untouched", () => {
    const body = "WTIA [Hong Kong] launched Wi-Fi.HK.\n\nMore than 12,000 hotspots.";
    expect(readableMilestoneBody(body)).toEqual(["WTIA [Hong Kong] launched Wi-Fi.HK.", "More than 12,000 hotspots."]);
  });

  it("leaves no shortcode visible in any published milestone, in either language", () => {
    // The migrated archive rendered eight `[pdf-embedder url=”…”]` strings verbatim on
    // /about/history; the PDFs they pointed at are not hosted on this site.
    for (const milestone of milestones) {
      for (const body of [milestone.bodyEn, milestone.bodyZh]) {
        for (const paragraph of readableMilestoneBody(body)) {
          expect(paragraph, milestone.slug).not.toMatch(/\[pdf-embedder\b/);
          expect(paragraph.trim(), milestone.slug).not.toBe("");
        }
      }
    }
  });
});

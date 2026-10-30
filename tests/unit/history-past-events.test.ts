import {existsSync} from "node:fs";
import {join} from "node:path";
import {describe, expect, it} from "vitest";

import {milestones} from "@/content/milestones";
import {milestoneSchema} from "@/content/schemas";
import {homeArchiveStories} from "@/components/home/archive-stories";
import {findBySlug} from "@/lib/history/milestones";

// Past-event milestones added from the WTIA Drive archive (past-events-photos.md v2).
const NEW_SLUGS = [
  "2026-tech-to-connect-2026-kick-off",
  "2026-tech-to-connect-2026-workshop-series",
];

const KEITH_EN = "then-Chairman (now Honorary Chairman) Mr Keith Li";
const KEITH_ZH = "時任主席（現任榮譽主席）李勁華先生";

function bySlug(slug: string) {
  const record = findBySlug(milestones, slug);
  expect(record, slug).toBeDefined();
  return record!;
}

describe("past-event history milestones", () => {
  // Entries that never existed on the WordPress site have no legacy url to redirect from.
  it("accepts a milestone without a legacy path", () => {
    const rest: Record<string, unknown> = {...milestones[0]};
    delete rest.legacyPath;
    expect(milestoneSchema.parse(rest).legacyPath).toBeUndefined();
  });

  it("adds each new past-event entry with no legacy path", () => {
    for (const slug of NEW_SLUGS) {
      expect(bySlug(slug).legacyPath, slug).toBeUndefined();
    }
  });

  // Any source entry with a field still marked 待核實 (to be verified) stays out of the code.
  it("leaves out every entry still awaiting verification", () => {
    for (const slug of [
      "2023-asia-smart-app-awards-2022-23",
      "2023-tech-to-connect-4-0",
      "2023-insidw-issue-2-launch",
      "2024-ict-joint-spring-dinner",
      "2024-japan-delegation-trip",
      "2024-generative-ai-leaders-summit",
      "2024-hong-kong-ict-awards-ict-startup-award",
      "2024-wtia-innotech-leaders-forum",
      "2024-asia-smart-app-awards-10th-anniversary",
    ]) {
      expect(findBySlug(milestones, slug), slug).toBeNull();
    }
  });

  // The kick-off is featured with no photo: it must not reach the photo-led homepage strip.
  it("keeps a photo-less featured entry off the homepage photo strip", () => {
    expect(homeArchiveStories().map(({slug}) => slug)).not.toContain("2026-tech-to-connect-2026-kick-off");
    for (const story of homeArchiveStories()) expect(story.images.length).toBeGreaterThan(0);
  });

  it("features exactly the agreed entries", () => {
    expect(milestones.filter(({featured}) => featured).map(({slug}) => slug).sort()).toEqual([
      "2001-establishment-of-wtia",
      "2014-wi-fi-hk",
      "2026-tech-to-connect-2026-kick-off",
      "asia-smart-innovation-awards-2025",
      "new-term-of-executive-committee-2022-2024",
      "the-strategies-for-expanding-global-internet-of-things-iot-markets",
      "wtia-21st-anniversary-celebration-and-inauguration-gala-dinner",
    ]);
  });

  it("ships every referenced image", () => {
    for (const {slug, images} of milestones) {
      for (const {src} of images) {
        expect(existsSync(join("public", src)), `${slug}: ${src}`).toBe(true);
      }
    }
  });

  it("replaces the third-party ASIA 2025 image with WTIA's own judging photos", () => {
    const record = bySlug("asia-smart-innovation-awards-2025");
    expect(record.images.map(({src}) => src)).toEqual([
      "/images/history/asia-smart-innovation-awards-2025-1.jpg",
      "/images/history/asia-smart-innovation-awards-2025-2.jpg",
      "/images/history/asia-smart-innovation-awards-2025-3.jpg",
    ]);
    expect(record.bodyEn).toContain(KEITH_EN);
    expect(record.bodyZh).toContain(KEITH_ZH);
  });

  it("names Keith Li as then-Chairman wherever he is named as Chairman", () => {
    for (const {slug, bodyEn, bodyZh} of milestones) {
      expect(bodyEn, slug).not.toMatch(/Chairman:?\s+Mr\.?\s+Keith Li/);
      expect(bodyZh, slug).not.toMatch(/主席[：:]?\s*(Keith Li|李勁華)/);
      expect(bodyZh, slug).not.toContain("現任榜譽主席");
    }
    const exco = bySlug("new-term-of-executive-committee-2022-2024");
    expect(exco.bodyEn).toContain(KEITH_EN);
    expect(exco.bodyZh).toContain(KEITH_ZH);
  });

  it("strips the WordPress leftovers from the 2020 UX/UI workshop", () => {
    const {bodyEn, bodyZh, images} = bySlug("asia-smart-app-workshop-ux-ui-more-than-you-think");
    for (const body of [bodyEn, bodyZh]) {
      expect(body).not.toContain("[pdf-embedder");
      expect(body).not.toMatch(/Speakers:|講者：/);
    }
    expect(images.length).toBeGreaterThan(0);
  });

  it("never writes the wrong brand", () => {
    expect(JSON.stringify(milestones)).not.toMatch(/WiseTech/i);
  });
});

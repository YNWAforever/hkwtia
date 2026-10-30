import {existsSync} from "node:fs";
import {join} from "node:path";
import {describe, expect, it} from "vitest";

import {milestones} from "@/content/milestones";
import {milestoneSchema} from "@/content/schemas";
import {homeArchiveStories} from "@/components/home/archive-stories";
import {findBySlug} from "@/lib/history/milestones";

// Past-event milestones added from the WTIA Drive archive (past-events-photos.md v4).
const NEW_SLUGS = [
  "2026-tech-to-connect-2026-kick-off",
  "2026-tech-to-connect-2026-workshop-series",
  "2024-hong-kong-ict-awards-ict-startup-award",
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
      "2024-wtia-innotech-leaders-forum",
      "2024-asia-smart-app-awards-10th-anniversary",
      "2021-asia-smart-app-awards-8th",
    ]) {
      expect(findBySlug(milestones, slug), slug).toBeNull();
    }
  });

  // The homepage strip is photo-led: only stories with at least one image reach it.
  it("keeps every homepage archive story photo-led", () => {
    for (const story of homeArchiveStories()) expect(story.images.length).toBeGreaterThan(0);
  });

  it("wires the kick-off photos and the 2024 ICT Startup Award ceremony photo", () => {
    expect(bySlug("2026-tech-to-connect-2026-kick-off").images.map(({src}) => src)).toEqual([
      "/images/history/2026-tech-to-connect-2026-kick-off-1.jpg",
      "/images/history/2026-tech-to-connect-2026-kick-off-2.jpg",
      "/images/history/2026-tech-to-connect-2026-kick-off-3.jpg",
    ]);
    const ict = bySlug("2024-hong-kong-ict-awards-ict-startup-award");
    expect(ict.month).toBe("11");
    expect(ict.images.map(({src}) => src)).toEqual(["/images/history/2024-hong-kong-ict-awards-ict-startup-award-1.jpg"]);
  });

  // Willy 2026-10-30: 「IoT markets 同 2022–24 ExCo 拎走主打，得返三條」. The third, the 2022/23
  // Asia Smart App Awards, is still held out while its month awaits verification.
  it("features exactly the agreed entries", () => {
    expect(milestones.filter(({featured}) => featured).map(({slug}) => slug).sort()).toEqual([
      "2026-tech-to-connect-2026-kick-off",
      "asia-smart-innovation-awards-2025",
    ]);
  });

  it("ships every referenced image", () => {
    for (const {slug, images} of milestones) {
      for (const {src} of images) {
        expect(existsSync(join("public", src)), `${slug}: ${src}`).toBe(true);
      }
    }
  });

  it("replaces the third-party ASIA 2025 image with WTIA's ceremony photos", () => {
    const record = bySlug("asia-smart-innovation-awards-2025");
    expect(record.images.map(({altEn}) => altEn).join(" ")).toContain("ceremony");
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

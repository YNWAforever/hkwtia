import {existsSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

import {milestones} from "@/content/milestones";
import {findBySlug, milestonesOnly} from "@/lib/history/milestones";

const KEITH_EN = "then-Chairman (now Honorary Chairman) Mr Keith Li";
const KEITH_ZH = "時任主席（現任榮譽主席）李勁華先生";

function bySlug(slug: string) {
  const record = findBySlug(milestones, slug);
  expect(record, slug).toBeDefined();
  return record!;
}

describe("past-event history milestones", () => {
  it("features only Willy's three highlights, each with a photo", () => {
    const featured = milestonesOnly(milestones).filter(({featured: isFeatured}) => isFeatured);
    expect(featured.map(({slug}) => slug)).toEqual([
      "2023-asia-smart-app-awards-2022-23",
      "asia-smart-innovation-awards-2025",
      "2026-tech-to-connect-2026-kick-off",
    ]);
    for (const record of featured) expect(record.images.length, record.slug).toBeGreaterThan(0);
  });

  it("keeps 2001, 2014, the gala, IoT markets, and the 2022–24 ExCo off the highlight row", () => {
    for (const slug of [
      "2001-establishment-of-wtia",
      "2014-wi-fi-hk",
      "2014-made-in-hong-kong-smartphone-apps-project",
      "wtia-21st-anniversary-celebration-and-inauguration-gala-dinner",
      "the-strategies-for-expanding-global-internet-of-things-iot-markets",
      "new-term-of-executive-committee-2022-2024",
    ]) {
      expect(bySlug(slug).featured, slug).toBe(false);
    }
  });

  it("places ASA 2021 on the 2022 ceremony year and keeps the 2021 title", () => {
    const record = bySlug("2021-asia-smart-app-awards-8th");
    expect(record).toMatchObject({
      year: 2022,
      month: "06",
      titleEn: "Asia Smart App Awards 2021",
      titleZh: "亞洲智能應用程式大獎 2021",
      featured: false,
      legacyPath: null,
    });
    expect(record.bodyEn).toContain("over 16 regional partners");
    expect(record.bodyEn).toContain("over 100 applications");
    expect(record.bodyEn).toContain("The presentation ceremony was held on 23 June 2022 at Cyberport 3 Function Room 1–3.");
    expect(record.bodyZh).toContain("頒獎典禮於 2022 年 6 月 23 日在數碼港 3 期 Function Room 1–3 舉行。");
  });

  it("records the 2022/23 awards in June 2023 without an invented finalist count", () => {
    const record = bySlug("2023-asia-smart-app-awards-2022-23");
    expect(record).toMatchObject({year: 2023, month: "06", featured: true, legacyPath: null});
    expect(record.bodyEn).toContain("On 29 June 2023 at Cyberport");
    expect(`${record.bodyEn} ${record.bodyZh}`).not.toContain("待核實");
    expect(record.bodyEn).not.toMatch(/\b(Eight|Nine|Ten)\s+(teams|finalists)\b/i);
  });

  it("does not add a 2026 chairman milestone or any HOLD entry", () => {
    expect(milestones.some((milestone) => milestone.year === 2026 && /chair|主席|會長/i.test(`${milestone.slug} ${milestone.titleEn} ${milestone.titleZh}`))).toBe(false);
    for (const slug of [
      "2023-insidw-issue-2-launch",
      "2024-ict-joint-spring-dinner",
      "2024-japan-delegation-trip",
      "2024-generative-ai-leaders-summit",
      "2024-wtia-innotech-leaders-forum",
      "2024-asia-smart-app-awards-10th-anniversary",
      "2021-tech-to-connect-5g-iot-series",
      "2021-hong-kong-ict-awards-ict-startup-award",
    ]) {
      expect(findBySlug(milestones, slug), slug).toBeNull();
    }
  });

  it("keeps the 2016 Wi-Fi.HK ceremony title free of the stray closing quote", () => {
    const title = bySlug("2016-building-up-wi-fi-hk-through-collaboration-pledging-ceremony").titleEn;
    expect(title).toBe("2016 – “Building up Wi-Fi.HK through Collaboration” Pledging Ceremony");
    expect(title.endsWith("Ceremony”")).toBe(false);
  });

  it("names Keith Li with Willy's title wherever the record calls him Chairman", () => {
    for (const {slug, bodyEn, bodyZh} of milestones) {
      expect(bodyEn, slug).not.toMatch(/Chairman:?\s+Mr\.?\s+Keith Li/);
      expect(bodyZh, slug).not.toMatch(/主席[：:]\s*(Keith Li|李勁華)/);
      expect(`${slug} ${bodyEn} ${bodyZh}`, slug).not.toMatch(/WiseTech/);
    }
    const asia = bySlug("asia-smart-innovation-awards-2025");
    expect(asia.bodyEn).toContain(KEITH_EN);
    expect(asia.bodyZh).toContain(KEITH_ZH);
    const exco = bySlug("new-term-of-executive-committee-2022-2024");
    expect(exco.bodyEn).toContain("Honorary Chairman");
    expect(exco.bodyZh).toContain("榮譽主席");
    expect(`${asia.bodyEn} ${asia.bodyZh} ${exco.bodyEn} ${exco.bodyZh}`).not.toContain("會長");
  });

  it("keeps internal verification notes out of every on-site body", () => {
    for (const {slug, bodyEn, bodyZh} of milestones) {
      expect(`${bodyEn} ${bodyZh}`, slug).not.toContain("待核實");
      expect(`${bodyEn} ${bodyZh}`, slug).not.toMatch(/Dora owns/i);
    }
  });

  it("drops the empty speaker lines and WordPress shortcodes from the UX/UI workshop", () => {
    const record = bySlug("asia-smart-app-workshop-ux-ui-more-than-you-think");
    expect(record.bodyEn).not.toContain("[pdf-embedder");
    expect(record.bodyZh).not.toContain("[pdf-embedder");
    expect(record.bodyEn).not.toContain("Speakers:");
    expect(record.bodyZh).not.toContain("講者：");
    expect(record.images).toHaveLength(1);
  });

  it("ships a file for every image a milestone names", () => {
    for (const {slug, images} of milestones) {
      for (const {src} of images) {
        expect(existsSync(join("public", src)), `${slug}: ${src}`).toBe(true);
      }
    }
  });
});

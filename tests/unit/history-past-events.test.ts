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
    expect(record.bodyEn).toBe(
      "Organised the 8th edition of Asia Smart App Awards. Co-organised with over 16 regional partners, attracted over 100 applications. The award ceremony was held on 23 June 2022.",
    );
    expect(record.bodyZh).toBe(
      "舉辦第8屆「亞洲智能應用程式大獎」，與來自16個不同亞洲地區的機構合作，成功吸引過百份報名申請。頒獎典禮於 2022 年 6 月 23 日舉行。",
    );
  });

  it("records the 2022/23 awards in June 2023 and leaves Alice's finalist wording", () => {
    const record = bySlug("2023-asia-smart-app-awards-2022-23");
    expect(record).toMatchObject({year: 2023, month: "06", featured: true, legacyPath: null});
    expect(record.bodyEn).toContain("Eight teams reached the final, three from Hong Kong.");
    expect(record.bodyZh).toContain("決賽隊數待核實：先前稿寫 8 隊、post-event 寫 Nine Finalists、邀請函寫 10");
  });

  it("does not add a 2026 chairman milestone or any entry still marked unverified", () => {
    expect(milestones.some((milestone) => milestone.year === 2026 && /chair|主席|會長/i.test(`${milestone.slug} ${milestone.titleEn} ${milestone.titleZh}`))).toBe(false);
    for (const slug of [
      "2023-tech-to-connect-4-0",
      "2023-insidw-issue-2-launch",
      "2024-ict-joint-spring-dinner",
      "2024-japan-delegation-trip",
      "2024-generative-ai-leaders-summit",
      "2024-hong-kong-ict-awards-ict-startup-award",
      "2024-wtia-innotech-leaders-forum",
      "2024-asia-smart-app-awards-10th-anniversary",
      "2020-smart-business-with-iot-webinar",
      "2021-5g-future-application-forum",
      "2021-tech-to-connect-5g-iot-series",
      "2021-i-and-t-festival-secondary-schools",
      "2021-hong-kong-ict-awards-ict-startup-award",
    ]) {
      expect(findBySlug(milestones, slug), slug).toBeNull();
    }
  });

  it("names Keith Li with Willy's title wherever the record calls him Chairman", () => {
    for (const {slug, bodyEn, bodyZh} of milestones) {
      expect(bodyEn, slug).not.toMatch(/Chairman:?\s+Mr\.?\s+Keith Li/);
      expect(bodyZh, slug).not.toMatch(/主席[：:]\s*(Keith Li|李勁華)/);
      expect(`${slug} ${bodyEn} ${bodyZh}`, slug).not.toMatch(/WiseTech/);
    }
    for (const slug of ["new-term-of-executive-committee-2022-2024", "asia-smart-innovation-awards-2025"]) {
      const record = bySlug(slug);
      expect(record.bodyEn, slug).toContain(KEITH_EN);
      expect(record.bodyZh, slug).toContain(KEITH_ZH);
      expect(`${record.bodyEn} ${record.bodyZh}`, slug).not.toContain("會長");
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

import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {asa} from "@/content/programs/asa";
import {summarizeProgrammes} from "@/lib/home/programme-summaries";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

/**
 * t484s2232 sections 1.1–1.4. Exact lines only. Unapproved blurbs, formerly
 * wording, fees, and archived edition labels stay where they already were.
 */
describe("approved website polish 1.1–1.4", () => {
  it("pins public programme names on nav, cards, and the programme page", () => {
    expect(en.Navigation.links.hkict).toBe("ICT Startup Award");
    expect(zh.Navigation.links.hkict).toBe("資訊科技初創企業獎");
    expect(en.Navigation.links.tct).toBe("Tech to Connect");
    expect(zh.Navigation.links.tct).toBe("智創互聯");
    expect(en.Navigation.links.asa).toBe("Asia Smart Innovation Awards");
    expect(zh.Navigation.links.asa).toBe("亞洲智慧創新大獎");
    expect(en.Navigation.links.cpai).toBe("CPAI");
    expect(zh.Navigation.links.cpai).toBe("CPAI");

    expect(en.Home.flagships.items.hkict.label).toBe("ICT Startup Award");
    expect(zh.Home.flagships.items.hkict.label).toBe("資訊科技初創企業獎");
    expect(en.Home.flagships.items.tct.label).toBe("Tech to Connect");
    expect(zh.Home.flagships.items.tct.label).toBe("智創互聯");
    expect(en.Home.flagships.items.asa.label).toBe("Asia Smart Innovation Awards");
    expect(zh.Home.flagships.items.asa.label).toBe("亞洲智慧創新大獎");
    expect(en.Home.flagships.items.cpai.label).toBe("CPAI");
    expect(zh.Home.flagships.items.cpai.label).toBe("CPAI");
    expect(en.Home.flagships.items.insidw.label).toBe("InsidW");
    expect(zh.Home.flagships.items.insidw.label).toBe("InsidW");

    expect(en.Home.programmeShowcase.items.hkict.name).toBe("ICT Startup Award");
    expect(zh.Home.programmeShowcase.items.hkict.name).toBe("資訊科技初創企業獎");
    expect(en.Home.programmeShowcase.items.tct.name).toBe("Tech to Connect");
    expect(zh.Home.programmeShowcase.items.tct.name).toBe("智創互聯");
    expect(en.Home.programmeShowcase.items.asa.name).toBe("Asia Smart Innovation Awards");
    expect(zh.Home.programmeShowcase.items.asa.name).toBe("亞洲智慧創新大獎");

    expect(en.programs.hkict.title).toBe("ICT Startup Award");
    expect(zh.programs.hkict.title).toBe("資訊科技初創企業獎");
    expect(en.programs.tct.title).toBe("Tech to Connect");
    expect(zh.programs.tct.title).toBe("智創互聯（Tech to Connect）");
    expect(en.programs.asa.title).toBe("Asia Smart Innovation Awards");
    expect(zh.programs.asa.title).toBe("亞洲智慧創新大獎");
    expect(en.programs.cpai.title).toBe("CPAI");
    expect(zh.programs.cpai.title).toBe("CPAI");
  });

  it("keeps the forbidden public titles off nav, cards, meta, and current page titles", () => {
    const chrome = [
      en.Navigation.links.hkict, zh.Navigation.links.hkict,
      en.Navigation.links.asa, zh.Navigation.links.asa,
      en.Navigation.links.tct, zh.Navigation.links.tct,
      en.Home.flagships.items.hkict.label, zh.Home.flagships.items.hkict.label,
      en.Home.flagships.items.asa.label, zh.Home.flagships.items.asa.label,
      en.Home.flagships.items.tct.label, zh.Home.flagships.items.tct.label,
      en.Home.programmeShowcase.items.hkict.name, zh.Home.programmeShowcase.items.hkict.name,
      en.Home.programmeShowcase.items.asa.name, zh.Home.programmeShowcase.items.asa.name,
      en.Home.programmeShowcase.items.tct.name, zh.Home.programmeShowcase.items.tct.name,
      en.programs.hkict.title, zh.programs.hkict.title,
      en.programs.asa.title, zh.programs.asa.title,
      en.programs.tct.title, zh.programs.tct.title,
      en.Programmes.metaDescription, zh.Programmes.metaDescription,
    ].join("\n");
    expect(chrome).not.toMatch(/HKICT Awards|香港資訊及通訊科技獎|Asia Smart App Awards|亞洲智能應用程式|Asia Smart App \/ Innovation|TCT/);
    expect(chrome).not.toContain("Tech Connect");
    expect(en.Home.flagships.items.cpai.blurb).toBe("Certified Practitioner in GenAI");
    expect(zh.Home.flagships.items.cpai.blurb).toBe("Certified Practitioner in GenAI");
    expect(en.Home.flagships.items.cpai.blurb).not.toBe("Explore the CPAI programme.");
    expect(zh.Home.flagships.items.cpai.blurb).not.toBe("了解 CPAI 計劃。");
  });

  it("pins Programmes meta and the 1.3 hero, catalogue, openings, and history titles", () => {
    expect(en.Programmes.metaDescription).toBe("WTIA programmes on the record: ICT Startup Award, Tech to Connect, Asia Smart Innovation Awards and CPAI.");
    expect(zh.Programmes.metaDescription).toBe("WTIA 計劃存檔：資訊科技初創企業獎、智創互聯（Tech to Connect）、亞洲智慧創新大獎及 CPAI。");
    expect(en.Programmes.hero.title).toBe("Awards, learning and industry programmes.");
    expect(zh.Programmes.hero.title).toBe("獎項、學習及業界計劃。");
    expect(en.Programmes.hero.lead).toBe("WTIA organises flagship awards and programmes for Hong Kong\u2019s technology community. Each page lists recorded editions and how to enquire.");
    expect(zh.Programmes.hero.lead).toBe("WTIA 為香港科技業界舉辦重點獎項與計劃。各專頁列出已存檔的歷屆紀錄，並說明查詢途徑。");
    expect(en.Programmes.open.title).toBe("Current openings.");
    expect(zh.Programmes.open.title).toBe("現正開放的計劃。");
    expect(en.Programmes.catalogue.title).toBe("Programmes and their editions.");
    expect(zh.Programmes.catalogue.title).toBe("計劃及歷屆紀錄。");
    expect(en.Programmes.catalogue.intro).toBe("Browse each programme by purpose, audience and past editions.");
    expect(zh.Programmes.catalogue.intro).toBe("按目的、對象及歷屆內容瀏覽各項計劃。");
    expect(en.Programmes.history.title).toBe("Edition history.");
    expect(zh.Programmes.history.title).toBe("歷屆紀錄。");
    expect(en.Programmes.open.emptyTitle).toBe("No programme applications are open on this site.");
    expect(zh.Programmes.open.emptyTitle).toBe("本網站目前沒有開放申請的計劃。");
  });

  it("pins the F16 holding lines and the programmes CTA", () => {
    expect(en.Showcase.noPublishedTitle).toBe("No member listings are published yet.");
    expect(zh.Showcase.noPublishedTitle).toBe("目前尚未刊登會員方案。");
    expect(en.Showcase.noPublishedDescription).toBe("Email contact@hkwtia.org if you want to be listed.");
    expect(zh.Showcase.noPublishedDescription).toBe("如欲刊登方案，請電郵 contact@hkwtia.org。");
    expect(en.Showcase.metaDescription).toBe("Member solutions from WTIA companies will be listed here.");
    expect(zh.Showcase.metaDescription).toBe("此頁將刊登 WTIA 會員企業的方案。");
    expect(en.Members.noPublishedTitle).toBe("No member profiles are published yet.");
    expect(zh.Members.noPublishedTitle).toBe("目前尚未刊登會員簡介。");
    expect(en.Members.noPublishedDescription).toBe("Email contact@hkwtia.org if you want to be listed.");
    expect(zh.Members.noPublishedDescription).toBe("如欲列入名錄，請電郵 contact@hkwtia.org。");
    expect(en.Members.metaDescription).toBe("The WTIA member directory will list member profiles here.");
    expect(zh.Members.metaDescription).toBe("WTIA 會員名錄將於此刊登會員簡介。");
    expect(en.Home.pathways.items.startups.cta).toBe("See programmes");
    expect(zh.Home.pathways.items.startups.cta).toBe("瀏覽計劃");
    expect(en.Home.marketProducts.marketplace.action).toBe("See programmes");
    expect(zh.Home.marketProducts.marketplace.action).toBe("瀏覽計劃");
  });

  it("pins the twenty-five-year history intro and leaves the founded-2001 meta alone", () => {
    expect(en.History.intro).toBe("Milestones from twenty-five years of Hong Kong's wireless and technology industry, starting in 2001.");
    expect(zh.History.intro).toBe("回顧自 2001 年起，香港無線及科技產業二十五年的發展里程碑。");
    expect(en.History.metaDescription).toBe("Twenty-five years of WTIA milestones—from 2001 founding through wireless, mobile and AI+ programmes.");
    expect(zh.History.metaDescription).toBe("香港無線科技商會二十五年歷程：自2001年成立至今的無線、流動及創科里程碑。");
    expect(en.History.intro).not.toMatch(/twenty-six|chairman/i);
    expect(zh.History.intro).not.toMatch(/二十六|主席/);
  });

  it("keeps ten ASA editions since 2013 and does not rewrite archived edition titles", () => {
    const summary = summarizeProgrammes().find((programme) => programme.id === "asa");
    expect(summary).toMatchObject({editionCount: 10, firstYear: 2013});
    expect(en.Home.programmeShowcase.editionsFact).toBe("{count, plural, one {# edition} other {# editions}} since {year}");
    expect(zh.Home.programmeShowcase.editionsFact).toBe("自 {year} 年起共 {count} 屆");
    expect(en.programs.record.editionsFact).toBe("{count, plural, one {# edition} other {# editions}} since {year}");
    expect(zh.programs.record.editionsFact).toBe("自 {year} 年起共 {count} 屆");
    expect(asa.editions.map((edition) => edition.labelEn)).toEqual([
      "Asia Smartphone Contest",
      "Asia Smartphone Apps Contest & Summit 2015",
      "Asia Smartphone Apps Summit cum Award Presentation Ceremony 2016",
      "Asia Smart App Summit cum Award Presentation Ceremony",
      "Asia Smart App Awards 2018/2019",
      "Asia Smart App Awards 2020",
      "Asia Smart App Awards 2021",
      "Asia Smart App Awards 2022/2023",
      "Asia Smart App Awards 2024",
      "Asia Smart Innovation Awards 2025",
    ]);
    expect(asa.editions[0]?.labelZh).toBe("Asia Smartphone Contest");
    expect(asa.editions.find((edition) => edition.yearStart === 2025)?.labelZh).toBe("2025 亞洲智慧創新大獎");
  });

  it("does not install the unapproved short blurbs, formerly line, or a chairman milestone", () => {
    expect(en.Home.flagships.items.hkict.blurb).toBe("Hong Kong ICT Awards — ICT Startup Award stream.");
    expect(zh.Home.flagships.items.hkict.blurb).toBe("香港資訊及通訊科技獎 — 資訊科技初創企業獎。");
    expect(en.Home.flagships.items.tct.blurb).toBe("WTIA industry series connecting technology and practice.");
    expect(en.Home.flagships.items.asa.blurb).toBe("WTIA’s Asia-wide smart app and innovation awards.");
    expect(zh.Home.flagships.items.asa.blurb).toBe("WTIA 亞洲智能應用與創新大獎。");
    expect(en.Home.flagships.items.insidw.blurb).toBe("WTIA community magazine and content platform.");
    expect(en.programs.hkict.description).toBe("Recognising excellence across Hong Kong's technology sector.");
    expect(en.programs.cpai.description).toBe("A focused WTIA programme supporting applied innovation.");
    const publicCopy = JSON.stringify({en, zh});
    expect(publicCopy).not.toContain("The 2025 edition is the Asia Smart Innovation Awards; earlier editions ran as the Asia Smart App Awards.");
    expect(publicCopy).not.toContain("2025 年為亞洲智慧創新大獎；較早屆別名為亞洲智能應用程式大獎。");
    expect(publicCopy).not.toContain("The course is taught by CUHK CUSCS.");
    expect(publicCopy).not.toContain("課程由中大 CUSCS 教授。");
    const milestones = readFileSync(resolve(process.cwd(), "content/milestones.ts"), "utf8");
    expect(milestones).not.toMatch(/chairman milestone|主席里程碑/i);
  });

  it("leaves approved fees and the WTIA brand untouched", () => {
    expect(en.Membership.tiersIntro).toBe("Annual fees: Individual HK$500, Corporate HK$1,800, Platinum HK$4,800.");
    expect(zh.Membership.tiersIntro).toBe("年費：個人 HK$500、企業 HK$1,800、白金 HK$4,800。");
    expect(en.Membership.metaDescription).toContain("HK$500");
    expect(en.Membership.metaDescription).toContain("HK$1,800");
    expect(en.Membership.metaDescription).toContain("HK$4,800");
    expect(en.Membership.tierBenefits.corporate.join("\n")).toContain("Priority invitations to flagship events (e.g. Hong Kong ICT Awards, Tech To Connect)");
    expect(`${en.About.metaDescription} ${zh.About.metaDescription}`).not.toMatch(/\bWISE\b|WiseTech/);
  });
});

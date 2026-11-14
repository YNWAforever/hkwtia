import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {excoRoster} from "@/content/exco-roster";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

type RosterCopy = Readonly<{name: string; wtiaRole?: string; title?: string; organization?: string; bio?: string; linkedIn?: string}>;

const allowedWordingEdits: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  "alex-kun": [],
  "lawrence-cheung": [["for of Research", "for Research"]],
  "antony-ma": [["Hoplite Technology Ltd", "Hoplite Technology Limited"]],
};

// Lines that are a name, title label, or document label in the source fence,
// not part of the biography. Removed before the whitespace comparison so a
// rewritten sentence cannot hide inside a matching header.
const headerLines: Readonly<Record<string, readonly string[]>> = {
  "alex-kun": [
    "Mr. Alex Kun",
    "Principle Lead – Business Development & Innovation",
    "Hutchison Telecommunications (Hong Kong) Limited",
  ],
  "antony-ma": ["CEO, Hoplite Technology Limited"],
  "burton-chau": ["Name: Mr. Burton CHAU", "Title: General Manager, Sanuker Inc. Limited"],
  "eric-yung": ["Playnote / Founder and CEO"],
  "jess-mak": [
    "Jess Mak",
    "Senior Vice President of Enterprise Market ",
    "Hutchison Telecommunications (Hong Kong) Limited",
  ],
  "larry-lam": ["Short Bio / Profile:"],
  "lawrence-cheung": ["Dr Lawrence CHEUNG Chi-chong", "Chief Technology Officer"],
  "lawrence-poon": [],
  "nelson-tse": ["Nelson Tse ", "Founder & CEO", "Million Tech Development Limited"],
  "ricky-chan": ["Name: Mr. Ricky CHAN", "Title: CEO and Co-Founder"],
  "simon-ha": ["Name: Simon Ha", "Title: Head of Business Development and Marketing"],
  "willy-lai": [],
};

function collapse(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function sourceFence(slug: string) {
  const markdown = readFileSync(resolve(process.cwd(), `docs/exco-update-20261113/${slug}.md`), "utf8");
  const match = markdown.match(/```text\n([\s\S]*?)```/);
  if (!match?.[1]) throw new Error(`missing bio fence for ${slug}`);
  return match[1];
}

describe("exco roster source", () => {
  it("lists fourteen members, Willy first, then surname, with zhPending on each", () => {
    expect(excoRoster).toHaveLength(14);
    expect(excoRoster.map((member) => member.slug)).toEqual([
      "willy-lai",
      "donald-chan",
      "jimmy-chan",
      "ricky-chan",
      "burton-chau",
      "lawrence-cheung",
      "simon-ha",
      "alex-kun",
      "larry-lam",
      "antony-ma",
      "jess-mak",
      "lawrence-poon",
      "nelson-tse",
      "eric-yung",
    ]);
    expect(excoRoster[0]?.surname).toBe("Lai");
    const rest = excoRoster.slice(1).map((member) => member.surname);
    expect([...rest].sort((left, right) => left.localeCompare(right))).toEqual(rest);
    expect(excoRoster.filter((member) => member.zhPending).map((member) => member.slug)).toEqual(["donald-chan", "jimmy-chan"]);
    const zhRoster = zh.Committees.roster as Record<string, RosterCopy>;
    expect(zhRoster["willy-lai"]?.name).toBe("賴志偉（Willy Lai）");
    expect(zhRoster["willy-lai"]?.title).toBe("FIMMICK 聯合創辦人及行政總裁");
    expect(zhRoster["willy-lai"]?.wtiaRole).toBe("主席");
    expect(zhRoster["simon-ha"]?.name).toBe("夏羽（Simon Ha）");
    expect(zhRoster["simon-ha"]?.wtiaRole).toBe("執行委員會委員");
    expect(zhRoster["lawrence-cheung"]?.wtiaRole).toBe("副主席");
    expect(zhRoster["nelson-tse"]?.wtiaRole).toBe("司庫及執行委員會委員");
    expect(zhRoster["eric-yung"]?.wtiaRole).toBe("法律顧問");
    expect(zhRoster["ricky-chan"]?.name).toBe("Ricky CHAN 先生");
    expect(zhRoster["burton-chau"]?.name).toBe("Burton CHAU 先生");
    expect(zhRoster["alex-kun"]?.name).toBe("Alex Kun 先生");
    expect(zhRoster["jess-mak"]?.name).toBe("Jess Mak 小姐");
    expect(zhRoster["larry-lam"]?.name).toBe("Larry Lam");
    expect(zhRoster["lawrence-poon"]?.name).toBe("Ir Prof. Lawrence Poon");
    const roles = Object.fromEntries(excoRoster.filter((member) => member.wtiaRole).map((member) => [member.slug, (en.Committees.roster as Record<string, RosterCopy>)[member.slug]?.wtiaRole]));
    expect(roles).toEqual({
      "willy-lai": "Chairman",
      "lawrence-cheung": "Vice Chairman",
      "nelson-tse": "Treasurer & Executive Committee Member",
      "eric-yung": "Legal Advisor",
      "simon-ha": "ExCo Member",
    });
    expect(JSON.stringify(en.Committees.roster)).not.toMatch(/副主席|司庫|法律顧問|執行委員會委員|會長|陳甘泉/);
    expect(JSON.stringify(zh.Committees)).not.toMatch(/會長|陳甘泉|譯註|開放問題/);
    const rosterSource = readFileSync(resolve(process.cwd(), "content/exco-roster.ts"), "utf8");
    expect(rosterSource).toContain("Vice Chairman = 副主席");
    expect(rosterSource).toContain("Treasurer & Executive Committee Member = 司庫及執行委員會委員");
    expect(rosterSource).toContain("Legal Advisor = 法律顧問");
    expect(rosterSource).toContain("ExCo Member = 執行委員會委員");
    expect(en.Committees.roster["larry-lam"]?.linkedIn).toBe("https://www.linkedin.com/in/larry-lam-2175a216/?isSelfProfile=false");
    expect(zh.Committees.roster["larry-lam"]?.linkedIn).toBe(en.Committees.roster["larry-lam"]?.linkedIn);
    expect(en.Committees.roster["larry-lam"]?.bio).not.toMatch(/linkedin/i);
    expect(zh.Committees.roster["larry-lam"]?.bio).not.toMatch(/linkedin/i);
    expect(en.Committees.roster["donald-chan"]).toEqual({name: "Donald Chan"});
    expect(en.Committees.roster["jimmy-chan"]).toEqual({name: "Jimmy Chan"});
  });

  it("keeps each biography as the source text with only whitespace normalised", () => {
    const enRoster = en.Committees.roster as Record<string, RosterCopy>;
    const zhRoster = zh.Committees.roster as Record<string, RosterCopy>;
    expect(Object.keys(enRoster)).toEqual(excoRoster.map((member) => member.slug));
    expect(Object.keys(zhRoster)).toEqual(excoRoster.map((member) => member.slug));
    for (const member of excoRoster) {
      const copy = enRoster[member.slug];
      const zhCopy = zhRoster[member.slug];
      if (!copy || !zhCopy) throw new Error(`missing roster copy for ${member.slug}`);
      expect(Boolean(copy.bio)).toBe(member.bio);
      expect(Boolean(copy.title)).toBe(member.title);
      expect(Boolean(copy.organization)).toBe(member.organization);
      expect(Boolean(copy.wtiaRole)).toBe(member.wtiaRole);
      expect(Boolean(copy.linkedIn)).toBe(Boolean(member.linkedIn));
      if (member.linkedIn) {
        expect(copy.linkedIn).toBe("https://www.linkedin.com/in/larry-lam-2175a216/?isSelfProfile=false");
        expect(zhCopy.linkedIn).toBe(copy.linkedIn);
      }
      if (copy.wtiaRole) expect(zhCopy.wtiaRole).not.toBe(copy.wtiaRole);
      expect(member.photo?.includes("-alt") ?? false).toBe(false);
      if (!member.bio) {
        expect(copy.bio).toBeUndefined();
        expect(copy.title).toBeUndefined();
        expect(zhCopy.bio).toBeUndefined();
        expect(member.photo).toBeNull();
        continue;
      }
      const raw = sourceFence(member.slug);
      let text = raw.replace(/\n*Linkedin:\nhttps?:\/\/\S+\s*$/i, "");
      for (const line of headerLines[member.slug] ?? []) {
        const index = text.indexOf(line);
        expect(index, `${member.slug} header ${line}`).toBeGreaterThanOrEqual(0);
        text = text.slice(0, index) + text.slice(index + line.length);
      }
      for (const [from, to] of allowedWordingEdits[member.slug] ?? []) text = text.replace(from, to);
      expect(collapse(copy.bio ?? ""), member.slug).toBe(collapse(text));
      expect(zhCopy.bio).not.toBe(copy.bio);
      expect(zhCopy.bio).not.toMatch(/會長|譯註|開放問題/);
      if (member.slug === "alex-kun") {
        expect(copy.title).toBe("Principal Lead – Business Development & Innovation");
        expect(raw).toContain("Principle Lead – Business Development & Innovation");
      } else if (copy.title) {
        expect(raw).toContain(copy.title);
      }
      if (copy.organization) expect(raw).toContain(copy.organization);
    }
    expect(enRoster["larry-lam"]?.title).toBeUndefined();
    expect(enRoster["lawrence-poon"]?.title).toBeUndefined();
    expect(excoRoster.find((member) => member.slug === "alex-kun")?.photo).toBeNull();
    expect(excoRoster.find((member) => member.slug === "lawrence-cheung")?.photo).toBe("/images/exco/lawrence-cheung.jpg");
    expect(excoRoster.filter((member) => member.photoPosition === "top").map((member) => member.slug)).toEqual(["ricky-chan", "antony-ma"]);
  });
});

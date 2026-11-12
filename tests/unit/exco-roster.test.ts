import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {excoRoster} from "@/content/exco-roster";

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
  it("lists twelve members, Willy first, then surname, with zhPending on each", () => {
    expect(excoRoster).toHaveLength(12);
    expect(excoRoster.map((member) => member.slug)).toEqual([
      "willy-lai",
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
    expect(excoRoster.every((member) => member.zhPending)).toBe(true);
    expect(excoRoster.flatMap((member) => member.zhName ? [member.slug] : [])).toEqual(["willy-lai", "simon-ha"]);
    expect(excoRoster.find((member) => member.slug === "willy-lai")?.zhTitle).toBe("主席");
    expect(excoRoster.filter((member) => member.zhTitle).map((member) => member.slug)).toEqual(["willy-lai"]);
    expect(JSON.stringify(excoRoster)).not.toMatch(/Donald|Jimmy|會長/);
  });

  it("keeps each biography as the source text with only whitespace normalised", () => {
    for (const member of excoRoster) {
      const raw = sourceFence(member.slug);
      let text = raw.replace(/\n*Linkedin:\nhttps?:\/\/\S+\s*$/i, "");
      for (const line of headerLines[member.slug] ?? []) {
        const index = text.indexOf(line);
        expect(index, `${member.slug} header ${line}`).toBeGreaterThanOrEqual(0);
        text = text.slice(0, index) + text.slice(index + line.length);
      }
      expect(collapse(member.paragraphs.join("\n")), member.slug).toBe(collapse(text));
      if (member.title) expect(raw).toContain(member.title);
      if (member.organization) expect(raw).toContain(member.organization);
      expect(member.photo?.includes("-alt") ?? false).toBe(false);
    }
    expect(excoRoster.find((member) => member.slug === "larry-lam")?.title).toBeNull();
    expect(excoRoster.find((member) => member.slug === "lawrence-poon")?.title).toBeNull();
    expect(excoRoster.find((member) => member.slug === "alex-kun")?.photo).toBeNull();
    expect(excoRoster.find((member) => member.slug === "lawrence-cheung")?.photo).toBe("/images/exco/lawrence-cheung.jpg");
    expect(excoRoster.filter((member) => member.photoPosition === "top").map((member) => member.slug)).toEqual(["ricky-chan", "antony-ma"]);
  });
});

import {createHash} from "node:crypto";
import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {excoRoster, type ExcoRosterMember} from "@/content/exco-roster";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

// Structural roster at 46817a0f (#236), the base this fill is cut from.
// Photos for Alex Kun, Donald Chan, and Jimmy Chan are null there.
// Every other field is the approved pack and must stay put.
const baseRoster: readonly ExcoRosterMember[] = [
  {slug: "willy-lai", surname: "Lai", wtiaRole: true, title: true, organization: false, bio: true, photo: "/images/exco/willy-lai.jpg", photoPosition: "center", zhPending: false},
  {slug: "donald-chan", surname: "Chan", wtiaRole: false, title: false, organization: false, bio: false, photo: null, photoPosition: "center", zhPending: true},
  {slug: "jimmy-chan", surname: "Chan", wtiaRole: false, title: false, organization: false, bio: false, photo: null, photoPosition: "center", zhPending: true},
  {slug: "ricky-chan", surname: "Chan", wtiaRole: false, title: true, organization: false, bio: true, photo: "/images/exco/ricky-chan.jpg", photoPosition: "top", zhPending: false},
  {slug: "burton-chau", surname: "Chau", wtiaRole: false, title: true, organization: false, bio: true, photo: "/images/exco/burton-chau.jpg", photoPosition: "center", zhPending: false},
  {slug: "lawrence-cheung", surname: "Cheung", wtiaRole: true, title: true, organization: false, bio: true, photo: "/images/exco/lawrence-cheung.jpg", photoPosition: "center", zhPending: false},
  {slug: "simon-ha", surname: "Ha", wtiaRole: true, title: true, organization: false, bio: true, photo: "/images/exco/simon-ha.jpg", photoPosition: "center", zhPending: false},
  {slug: "alex-kun", surname: "Kun", wtiaRole: false, title: true, organization: true, bio: true, photo: null, photoPosition: "center", zhPending: false},
  {slug: "larry-lam", surname: "Lam", wtiaRole: false, title: false, organization: false, bio: true, linkedIn: true, photo: "/images/exco/larry-lam.jpg", photoPosition: "center", zhPending: false},
  {slug: "antony-ma", surname: "Ma", wtiaRole: false, title: true, organization: false, bio: true, photo: "/images/exco/antony-ma.jpg", photoPosition: "top", zhPending: false},
  {slug: "jess-mak", surname: "Mak", wtiaRole: false, title: true, organization: true, bio: true, photo: "/images/exco/jess-mak.jpg", photoPosition: "center", zhPending: false},
  {slug: "lawrence-poon", surname: "Poon", wtiaRole: false, title: false, organization: false, bio: true, photo: "/images/exco/lawrence-poon.jpg", photoPosition: "center", zhPending: false},
  {slug: "nelson-tse", surname: "Tse", wtiaRole: true, title: true, organization: true, bio: true, photo: "/images/exco/nelson-tse.jpg", photoPosition: "center", zhPending: false},
  {slug: "eric-yung", surname: "Yung", wtiaRole: true, title: true, organization: false, bio: true, photo: "/images/exco/eric-yung.jpg", photoPosition: "center", zhPending: false},
];

const filledPhotos = {
  "alex-kun": "/images/exco/alex-kun.jpg",
  "donald-chan": "/images/exco/donald-chan.jpg",
  "jimmy-chan": "/images/exco/jimmy-chan.jpg",
} as const;

// sha256(JSON.stringify(messages.Committees)) at 46817a0f. The whole namespace,
// not only the roster, so a page title or empty-biography label cannot drift
// inside this portrait fill.
const baseCommitteesSha256 = {
  en: "4c751c345e884495c7236c4dba8865024877cfe9bf8a97a89ebcfccf351299e2",
  "zh-HK": "aa0f0ee7a94a439c6ecab2707a7d4df3b43296d94862805df4123d07482c1324",
} as const;

// Display derivatives of the checksummed official-page files. Alex is resized
// to the existing 1600 longest-edge convention. Donald and Jimmy keep the
// source pixel dimensions, including Jimmy's 1200×1199 aspect.
const displayDerivatives = {
  "alex-kun.jpg": {
    width: 1600,
    height: 1600,
    sha256: "11da10e8690c6a201e2bb54562d05d7f30a559014e23ea053f22e327f0dcc6f6",
  },
  "donald-chan.jpg": {
    width: 1111,
    height: 1111,
    sha256: "95099d1b847afbed2fc06d6e2367f99b69b8b2ba7633d9f72de952b4d820228c",
  },
  "jimmy-chan.jpg": {
    width: 1200,
    height: 1199,
    sha256: "6680f310b5523a4b1a43b67b7da3f61f9733392ec1a2623c9f5a29c0030099d7",
  },
} as const;

const sourceProvenance = {
  "alex-kun": {
    url: "https://hkwtia.org/wp-content/uploads/2020/02/Alex-Kun-3-scaled-e1588757660518.jpg",
    sha256: "d0fa7c940ad63f59f17584fe2610d737220b042289fc81134f106a637271b85e",
  },
  "donald-chan": {
    url: "https://hkwtia.org/wp-content/uploads/2024/10/Donald.jpeg",
    sha256: "b20089bd0d9450e4a5e5b1c6094b891ebce9cb786a246b68309908a9640ded15",
  },
  "jimmy-chan": {
    url: "https://hkwtia.org/wp-content/uploads/2020/02/Jimmy-Chan-1200x1199.jpg",
    sha256: "812a1b7cdafd23c376cac594eede39c845624e5fb200d4b7269e7b64e7a58a56",
  },
} as const;

type Structural = Readonly<{
  slug: string;
  surname: string;
  wtiaRole: boolean;
  title: boolean;
  organization: boolean;
  bio: boolean;
  linkedIn: boolean;
  photo: string | null;
  photoPosition: "center" | "top";
  zhPending: boolean;
}>;

function structural(member: ExcoRosterMember): Structural {
  return {
    slug: member.slug,
    surname: member.surname,
    wtiaRole: member.wtiaRole,
    title: member.title,
    organization: member.organization,
    bio: member.bio,
    linkedIn: member.linkedIn ?? false,
    photo: member.photo,
    photoPosition: member.photoPosition,
    zhPending: member.zhPending,
  };
}

export function portraitDiff(current: readonly Structural[], base: readonly Structural[]) {
  const photoChanges: string[] = [];
  const otherChanges: string[] = [];
  if (current.length !== base.length) otherChanges.push(`length ${current.length}!=${base.length}`);
  const count = Math.min(current.length, base.length);
  for (let index = 0; index < count; index += 1) {
    const left = current[index];
    const right = base[index];
    if (!left || !right) continue;
    const {photo: leftPhoto, ...leftRest} = left;
    const {photo: rightPhoto, ...rightRest} = right;
    if (JSON.stringify(leftRest) !== JSON.stringify(rightRest)) otherChanges.push(left.slug || right.slug);
    if (leftPhoto !== rightPhoto) photoChanges.push(left.slug);
  }
  return {photoChanges, otherChanges};
}

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function jpegSize(bytes: Buffer) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("not a jpeg");
  let index = 2;
  while (index < bytes.length) {
    if (bytes[index] !== 0xff) {
      index += 1;
      continue;
    }
    const marker = bytes[index + 1] ?? 0;
    if (marker === 0xd8 || marker === 0xd9) {
      index += 2;
      continue;
    }
    const length = bytes.readUInt16BE(index + 2);
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return {width: bytes.readUInt16BE(index + 7), height: bytes.readUInt16BE(index + 5)};
    }
    if (marker === 0xda) break;
    index += 2 + length;
  }
  throw new Error("jpeg size missing");
}

describe("exco portrait fill against 46817a0f", () => {
  it("keeps the three portrait refs empty while consent is unproven", () => {
    const diff = portraitDiff(excoRoster.map(structural), baseRoster.map(structural));
    expect(diff.otherChanges).toEqual([]);
    expect(diff.photoChanges).toEqual([]);
    for (const slug of Object.keys(filledPhotos)) {
      expect(excoRoster.find((member) => member.slug === slug)?.photo).toBeNull();
    }
    const rendered = excoRoster.filter((member) => member.photo === null).map((member) => member.slug);
    expect(rendered).toEqual(["donald-chan", "jimmy-chan", "alex-kun"]);
  });

  it("leaves EN and zh-HK committee copy, including Donald and Jimmy name-only bios, unchanged", () => {
    expect(sha256(en.Committees)).toBe(baseCommitteesSha256.en);
    expect(sha256(zh.Committees)).toBe(baseCommitteesSha256["zh-HK"]);
    expect(en.Committees.roster["donald-chan"]).toEqual({name: "Donald Chan"});
    expect(en.Committees.roster["jimmy-chan"]).toEqual({name: "Jimmy Chan"});
    expect(zh.Committees.roster["donald-chan"]).toEqual({name: "Donald Chan"});
    expect(zh.Committees.roster["jimmy-chan"]).toEqual({name: "Jimmy Chan"});
    expect(en.Committees.roster["willy-lai"]?.wtiaRole).toBe("Chairman");
    expect(zh.Committees.roster["willy-lai"]?.wtiaRole).toBe("主席");
    expect("title" in en.Committees.roster["lawrence-poon"]).toBe(false);
    expect("title" in zh.Committees.roster["lawrence-poon"]).toBe(false);
  });

  it("detects a role, bio, or unrelated photo change", () => {
    const base = baseRoster.map(structural);
    const filled = base.map((member) => member.slug === "donald-chan"
      ? {...member, photo: filledPhotos["donald-chan"]}
      : member);
    expect(portraitDiff(filled, base)).toEqual({photoChanges: ["donald-chan"], otherChanges: []});
    const role = filled.map((member) => member.slug === "donald-chan" ? {...member, wtiaRole: true} : member);
    expect(portraitDiff(role, base).otherChanges).toEqual(["donald-chan"]);
    const unrelated = filled.map((member) => member.slug === "willy-lai" ? {...member, photo: "/images/exco/burton-chau.jpg"} : member);
    expect(portraitDiff(unrelated, base).photoChanges).toContain("willy-lai");
    const committees = structuredClone(en.Committees) as {roster: Record<string, {name?: string; wtiaRole?: string}>};
    committees.roster["donald-chan"] = {name: "Donald Chan", wtiaRole: "Vice Chairman"};
    expect(sha256(committees)).not.toBe(baseCommitteesSha256.en);
  });

  it("keeps the three derivatives off the public web root and records provenance", () => {
    const rosterSource = readFileSync(resolve(process.cwd(), "content/exco-roster.ts"), "utf8");
    expect(rosterSource).toContain("Old-site publication does not establish consent");
    expect(rosterSource).toContain("Consent is not established in the supplied evidence");
    expect(rosterSource).not.toContain("no later consent record exists");
    expect(rosterSource).toContain("content/exco-portraits-withheld/");
    expect(rosterSource).toContain("https://hkwtia.org/wp-content/uploads/2020/02/Jimmy-Chan.jpg");
    for (const source of Object.values(sourceProvenance)) {
      expect(rosterSource).toContain(source.url);
      expect(rosterSource).toContain(source.sha256);
    }
    for (const [fileName, expected] of Object.entries(displayDerivatives)) {
      expect(existsSync(resolve(process.cwd(), "public/images/exco", fileName))).toBe(false);
      const bytes = readFileSync(resolve(process.cwd(), "content/exco-portraits-withheld", fileName));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(expected.sha256);
      expect(jpegSize(bytes)).toEqual({width: expected.width, height: expected.height});
    }
  });
});

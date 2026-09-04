import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import type {ImgHTMLAttributes} from "react";
import {describe, expect, it, vi} from "vitest";

import {ProgramCredential} from "@/components/marketing/program-credential";
import {
  localiseImages,
  ProgramEditions,
  type EditionView,
} from "@/components/marketing/program-editions";
import type {ProgramImage} from "@/content/schemas";

vi.mock("next/image", () => ({
  default: ({alt, ...props}: ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element -- unit-test projection of next/image
    return <img alt={alt} {...props} />;
  },
}));

const recordImages = [{
  src: "/images/programs/award-night.jpg",
  altEn: "Award recipients on stage",
  altZh: "得獎者在台上合照",
}] satisfies readonly ProgramImage[];

const editionCopy = {
  editionsHeading: "Editions",
  winnersHeading: "Winners",
  categoryHeading: "Category",
  winnersOffSite: "The full winner list is published on the edition's own site.",
  winnersOffSiteLink: "View the winners",
  winnersUnrecorded: "WTIA's archive does not record the winners for this edition.",
} as const;

function renderEditions(editions: readonly EditionView[]) {
  return render(<ProgramEditions {...editionCopy} editions={editions} />);
}

describe("programme editorial presentation", () => {
  it.each([
    ["ASA", "Asia Smart App Awards 2021"],
    ["HKICT", "2024"],
  ])("states the explicit unrecorded winner variant for %s", (_programme, heading) => {
    renderEditions([{
      heading,
      lines: [],
      winners: {kind: "unrecorded"},
      images: [],
    }]);

    expect(screen.getByRole("heading", {level: 2, name: "Editions"})).toBeVisible();
    expect(screen.getByRole("heading", {level: 3, name: heading})).toBeVisible();
    expect(screen.getByText("WTIA's archive does not record the winners for this edition.")).toBeVisible();
  });

  it.each([
    [false, "Award recipients on stage"],
    [true, "得獎者在台上合照"],
  ])("renders localized edition gallery images with hardened intrinsic sizing (zh=%s)", (zh, expectedAlt) => {
    renderEditions([{
      heading: zh ? "二零二三年" : "2023",
      lines: [zh ? "由存檔記錄。" : "Recorded by the archive."],
      winners: {
        kind: "listed",
        entries: [{name: "Verified winner", category: "Gold"}],
      },
      images: localiseImages(recordImages, zh),
    }]);

    const itemHeading = screen.getByRole("heading", {level: 3, name: zh ? "二零二三年" : "2023"});
    const edition = itemHeading.closest("li");
    if (!edition) throw new Error("EXPECTED_EDITION_LIST_ITEM");
    expect(within(edition).getByRole("img", {name: expectedAlt})).toHaveAttribute("width", "960");
    expect(within(edition).getByRole("img", {name: expectedAlt})).toHaveAttribute("height", "640");
    expect(within(edition).getByRole("img", {name: expectedAlt})).toHaveAttribute("sizes", "(min-width: 768px) 50vw, 100vw");
    expect(within(edition).getByRole("img", {name: expectedAlt})).toHaveAttribute("loading", "lazy");
  });

  it("keeps TCT as an edition series with no winners heading or category", () => {
    renderEditions([{
      heading: "Tech to Connect 4.0",
      lines: ["Ten workshops, two seminars and a Leaders Summit."],
      images: [],
    }]);

    expect(screen.getByRole("heading", {level: 2, name: "Editions"})).toBeVisible();
    expect(screen.getByRole("heading", {level: 3, name: "Tech to Connect 4.0"})).toBeVisible();
    expect(screen.queryByText("Winners")).not.toBeInTheDocument();
    expect(screen.queryByText("Category")).not.toBeInTheDocument();
  });

  it("keeps CPAI facts, the separate partner certificate, syllabus, and localized gallery", () => {
    render(
      <ProgramCredential
        courseName="Generative AI for Business Innovation and Applications"
        coursePartner="CUHK School of Continuing and Professional Studies"
        coursePartnerHeading="Course delivered with"
        images={localiseImages(recordImages, true)}
        issuer="WTIA"
        issuerHeading="Issued by"
        partnerCertificate="CUSCS certificate of completion"
        partnerCertificateHeading="Graduates also receive"
        syllabus={["Enterprise AI strategy"]}
        syllabusHeading="Syllabus"
      />,
    );

    expect(screen.getByRole("heading", {level: 2, name: "Generative AI for Business Innovation and Applications"})).toBeVisible();
    expect(screen.getByRole("heading", {level: 3, name: "Syllabus"})).toBeVisible();
    expect(screen.getByText("Issued by").nextElementSibling).toHaveTextContent("WTIA");
    expect(screen.getByText("Course delivered with").nextElementSibling).toHaveTextContent("CUHK School of Continuing and Professional Studies");
    expect(screen.getByText("Graduates also receive").nextElementSibling).toHaveTextContent("CUSCS certificate of completion");
    expect(screen.getByText("CUSCS certificate of completion")).not.toHaveTextContent("WTIA");
    expect(screen.getByRole("img", {name: "得獎者在台上合照"})).toHaveAttribute("width", "960");
    expect(screen.getByRole("img", {name: "得獎者在台上合照"})).toHaveAttribute("height", "640");
    expect(screen.getByRole("img", {name: "得獎者在台上合照"})).toHaveAttribute("sizes", "(min-width: 768px) 50vw, 100vw");
  });

  // Scoped to asa/hkict/tct only -- the three routes this task (WP-4 Task 15) rewrites onto
  // PageHero + RichCompass. cpai keeps its pre-rewrite ProgramDetail shape until WP-4 Task 16,
  // which lands its own equivalent version of this same assertion set for that route; adding
  // cpai here now would fail until that later task lands.
  it("keeps the three rewritten routes server-only, metadata-owned, and mapped from the correct typed record", () => {
    const routes = [
      ["asa", "asa.editions.map"],
      ["hkict", "hkict.editions.map"],
      ["tct", "tct.editions.map"],
    ] as const;

    for (const [id, mapping] of routes) {
      const source = readFileSync(resolve(process.cwd(), `app/[locale]/(public)/programs/${id}/page.tsx`), "utf8");
      expect(source).toContain(`import {${id}} from '@/content/programs/${id}'`);
      expect(source).toContain(`item.id === '${id}'`);
      expect(source).toContain(mapping);
      expect(source).toContain(`pathname: '/programs/${id}'`);
      expect(source).toContain("title: t('title')");
      expect(source).toContain("description: t('description')");
      expect(source).toContain("image: program.image");
      expect(source).toContain("setRequestLocale(locale)");
      expect(source).toContain("PageHero");
      expect(source).toContain("RichCompass");
      expect(source).toContain("heading={tr('statusHeading')}");
      expect(source).toContain("{t('status')}");
      expect(source).not.toContain("ProgramDetail");
      // @/config/site is the established first-party site-contact module (already imported by
      // contact/page.tsx and membership/page.tsx) that the mailto action reads siteConfig.contact.email
      // from -- not the donor/mock-data config this guard was written to exclude, so it is allowed here.
      expect(source).not.toMatch(/donor|mock-data|mockData|@\/config\/(?!site['"])/i);
      expect(source).not.toMatch(/["']use client["']/);
      expect(source).not.toMatch(/<main\b/);
    }
  });
});

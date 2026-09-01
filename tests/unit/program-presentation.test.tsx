import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import type {ImgHTMLAttributes} from "react";
import {describe, expect, it, vi} from "vitest";

import {ProgramCredential} from "@/components/marketing/program-credential";
import {ProgramDetail} from "@/components/marketing/program-detail";
import {
  localiseImages,
  ProgramEditions,
  type EditionView,
} from "@/components/marketing/program-editions";
import type {ProgramImage, ProgramRecord} from "@/content/schemas";

vi.mock("next/image", () => ({
  default: ({alt, ...props}: ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element -- unit-test projection of next/image
    return <img alt={alt} {...props} />;
  },
}));

const routeRecord = {
  id: "asa",
  namespace: "programs.asa",
  image: "/images/projects-hero.jpg",
} satisfies ProgramRecord;

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
  it("renders the route record through one institutional intro and a status story", () => {
    render(
      <ProgramDetail
        description="Celebrating verified smart applications across Asia."
        program={routeRecord}
        status="Contact WTIA for the current programme timetable."
        statusHeading="Current status"
        title="Asia Smart App Awards"
      />,
    );

    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(screen.getByRole("heading", {level: 1, name: "Asia Smart App Awards"})).toBeVisible();
    expect(screen.getByRole("heading", {level: 2, name: "Current status"})).toBeVisible();
    expect(screen.getByText("Celebrating verified smart applications across Asia.")).toBeVisible();
    expect(screen.getByText("Contact WTIA for the current programme timetable.")).toBeVisible();
    const decorativeIntroImage = document.querySelector('img[alt=""]');
    expect(decorativeIntroImage).toHaveAttribute("src", "/images/projects-hero.jpg");
    expect(decorativeIntroImage).toHaveAttribute("width", "1280");
    expect(decorativeIntroImage).toHaveAttribute("height", "960");
    expect(decorativeIntroImage).toHaveAttribute("sizes", "(min-width: 1024px) 50vw, 100vw");
    expect(document.querySelector("main")).not.toBeInTheDocument();
  });

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

  it("keeps the four routes server-only, metadata-owned, and mapped from the correct typed record", () => {
    const routes = [
      ["asa", "asa.editions.map"],
      ["cpai", "cpai.syllabus.map"],
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
      expect(source).toContain("status={t('status')}");
      expect(source).toContain("statusHeading={tr('statusHeading')}");
      expect(source).not.toMatch(/donor|mock-data|mockData|@\/config\//i);
      expect(source).not.toContain("PageHero");
      expect(source).not.toMatch(/["']use client["']/);
      expect(source).not.toMatch(/<main\b/);
    }

    const detailSource = readFileSync(resolve(process.cwd(), "components/marketing/program-detail.tsx"), "utf8");
    expect(detailSource).toContain("InstitutionalPageIntro");
    expect(detailSource).toContain("StorySection");
    expect(detailSource).not.toContain("PageHero");
  });
});

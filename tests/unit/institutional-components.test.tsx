import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {
  assertOwnOriginEditorialImage,
  InstitutionalPageIntro,
} from "@/components/marketing/institutional-page-intro";
import {MediaGallery} from "@/components/marketing/media-gallery";
import {StorySection} from "@/components/marketing/story-section";

vi.mock("next/image", () => ({
  default: ({alt, priority, ...props}: React.ImgHTMLAttributes<HTMLImageElement> & {priority?: boolean}) => {
    void priority;
    // eslint-disable-next-line @next/next/no-img-element -- unit-test projection of next/image
    return <img alt={alt} {...props} />;
  },
}));

describe("institutional presentation primitives", () => {
  it("renders the institutional intro with one h1 and a localized own-origin image", () => {
    render(
      <InstitutionalPageIntro
        eyebrow="About WTIA"
        image="/images/about-hero.jpg"
        imageAlt="Hong Kong technology community"
        lead="Connecting Hong Kong's technology industry."
        title="Who we are"
      />,
    );

    const heading = screen.getByRole("heading", {level: 1, name: "Who we are"});
    const section = heading.closest("section");
    const image = screen.getByRole("img", {name: "Hong Kong technology community"});

    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(image).toHaveAttribute("src", "/images/about-hero.jpg");
    expect(image).toHaveAttribute("width", "1280");
    expect(image).toHaveAttribute("height", "960");
    expect(image).toHaveAttribute("sizes", "(min-width: 1024px) 50vw, 100vw");
    expect(document.querySelector("main")).not.toBeInTheDocument();
  });

  it("renders the institutional intro without an image", () => {
    render(
      <InstitutionalPageIntro
        eyebrow="Chairman's message"
        lead="A message to our members."
        title="Building the future together"
      />,
    );

    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("rejects a supplied empty institutional intro image", () => {
    expect(() => InstitutionalPageIntro({
      eyebrow: "About WTIA",
      image: "",
      imageAlt: "Hong Kong technology community",
      lead: "Connecting Hong Kong's technology industry.",
      title: "Who we are",
    })).toThrow(new Error("OWN_ORIGIN_IMAGE_REQUIRED"));
  });

  it("renders plain and warm story sections with distinct presentation", () => {
    render(
      <>
        <StorySection heading="Our mission" tone="plain">
          <p>Mission content</p>
        </StorySection>
        <StorySection heading="Our community" intro="Built through collaboration." tone="warm">
          <p>Community content</p>
        </StorySection>
      </>,
    );

    const plain = screen.getByRole("heading", {level: 2, name: "Our mission"}).closest("section");
    const warm = screen.getByRole("heading", {level: 2, name: "Our community"}).closest("section");

    expect(plain).toHaveClass("bg-background");
    expect(warm).toHaveClass("bg-shell-warm");
    expect(plain?.className).not.toBe(warm?.className);
    expect(screen.getByText("Built through collaboration.")).toBeVisible();
    expect(screen.getByText("Mission content")).toBeVisible();
    expect(screen.getByText("Community content")).toBeVisible();
  });

  it("renders a responsive two-image media gallery with localized alternatives", () => {
    render(
      <MediaGallery
        images={[
          {src: "/images/history/launch.jpg", alt: "WTIA launch event"},
          {src: "/images/history/award.jpg", alt: "創科獎項典禮"},
        ]}
      />,
    );

    const gallery = screen.getByRole("list");
    const images = within(gallery).getAllByRole("img");

    expect(within(gallery).getAllByRole("listitem")).toHaveLength(2);
    expect(images).toHaveLength(2);
    expect(images.map((image) => image.getAttribute("alt"))).toEqual(["WTIA launch event", "創科獎項典禮"]);
    for (const image of images) {
      expect(image).toHaveAttribute("width", "960");
      expect(image).toHaveAttribute("height", "640");
      expect(image).toHaveAttribute("sizes", "(min-width: 768px) 50vw, 100vw");
    }
  });

  it("renders nothing for an empty media gallery", () => {
    const {container} = render(<MediaGallery images={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    "/images/about-hero.jpg",
    "/images/history/launch.jpg",
    "/images/about-hero.jpg?v=2#focus",
  ])("accepts the own-origin editorial image path %s", (value) => {
    expect(assertOwnOriginEditorialImage(value)).toBe(value);
  });

  it.each([
    "https://donor.example/hero.jpg",
    "http://donor.example/hero.jpg",
    "//donor.example/hero.jpg",
    "images/about-hero.jpg",
    "/\\evil.example/x",
    "/\\\\evil.example/x",
    "/",
    "/?q=1",
    "/#fragment",
    "",
    " /images/about-hero.jpg",
    "/images/about-hero.jpg ",
    "/images/about hero.jpg",
    "/images/about\nhero.jpg",
    "/images/about\thero.jpg",
    "/images/\u0000hero.jpg",
    "/images/%ZZ.jpg",
    "/images/%E0%A4%A.jpg",
    "/images/%20hero.jpg",
    "/images/%09hero.jpg",
    "/images/%0Ahero.jpg",
    "/images/%0Dhero.jpg",
    "/images/%7Fhero.jpg",
    "/%5C%5Cevil.example/x",
    "/%2F%2Fevil.example/x",
    "/%2e",
    "/%255C%255Cevil.example/x",
    "/%252F%252Fevil.example/x",
    "/%252e",
    "/%25255C%25255Cevil.example/x",
    "/%2525252F%2525252Fevil.example/x",
  ])("rejects the ambiguous or non-own-origin editorial image source %s", (value) => {
    expect(() => assertOwnOriginEditorialImage(value)).toThrow(new Error("OWN_ORIGIN_IMAGE_REQUIRED"));
  });

  it("validates every media source before rendering", () => {
    expect(() => MediaGallery({
      images: [
        {src: "/images/history/launch.jpg", alt: "WTIA launch event"},
        {src: "https://donor.example/award.jpg", alt: "Remote award image"},
      ],
    })).toThrow(new Error("OWN_ORIGIN_IMAGE_REQUIRED"));
  });

  it("keeps all three primitives server-only and free of main landmarks", () => {
    for (const file of [
      "components/marketing/institutional-page-intro.tsx",
      "components/marketing/story-section.tsx",
      "components/marketing/media-gallery.tsx",
    ]) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/["']use client["']/);
      expect(source).not.toMatch(/\buse(?:State|Effect|LayoutEffect|Memo|Callback|Reducer|Ref|Context|Transition|DeferredValue|SyncExternalStore)\b/);
      expect(source).not.toMatch(/<main\b/);
    }
  });
});

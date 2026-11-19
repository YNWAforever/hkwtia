import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {NewsArchiveBody} from "@/components/marketing/news-archive-body";
import type {ArchiveBlock} from "@/lib/news/archive-document";

const labels = {
  externalHint: " (opens in a new tab)",
  missingPhoto: "missing",
  openPhoto: "open",
  missingFile: "missing file",
  photoAlt: "Archived photograph. The source did not include a caption.",
  consentOpen: "Member photograph withheld. Consent to publish this portrait is still open.",
  unprovenPhoto: "This photograph is not shown. The current public file is not proven identical to the export.",
};

function figure(overrides: Partial<Extract<ArchiveBlock, {type: "figure"}>>): ArchiveBlock {
  return {
    type: "figure",
    sourceUrl: "https://hkwtia.org/wp-content/uploads/example.jpg",
    alt: "",
    caption: [],
    localPath: "/images/news-archive/display/example.jpg",
    originalPath: "/images/news-archive/original/example.jpg",
    sha256: "a".repeat(64),
    error: null,
    assetStatus: "stored",
    ...overrides,
  };
}

describe("news archive figure limits", () => {
  it("shows a stored photograph whose bytes are not under a hold", () => {
    render(<NewsArchiveBody blocks={[figure({byteClaim: "wxr-size-match"})]} labels={labels} />);
    expect(screen.getByRole("img").getAttribute("src")).toBe("/images/news-archive/display/example.jpg");
  });

  it("withholds a current public file that is not proven identical to the export", () => {
    render(<NewsArchiveBody blocks={[figure({byteClaim: "current-url-not-wxr-proven"})]} labels={labels} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(labels.unprovenPhoto)).toBeTruthy();
  });

  it("withholds a member portrait while consent is open", () => {
    render(<NewsArchiveBody blocks={[figure({consent: "open-member-portrait"})]} labels={labels} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(labels.consentOpen)).toBeTruthy();
  });

  it("does not substitute a file for the open ExCo photograph", () => {
    render(<NewsArchiveBody blocks={[figure({localPath: null, originalPath: null, sha256: null, assetStatus: "open", error: "open-awaiting-parent-file", byteClaim: undefined})]} labels={labels} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(labels.openPhoto)).toBeTruthy();
  });
});

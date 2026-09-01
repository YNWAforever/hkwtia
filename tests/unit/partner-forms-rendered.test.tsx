import {fireEvent, render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import en from "@/messages/en.json";

const reactState = vi.hoisted(() => ({results: [] as Array<readonly [unknown, (data: FormData) => void, boolean]>, useActionState: vi.fn()}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  reactState.useActionState.mockImplementation((action: (data: FormData) => void, initial: unknown) => reactState.results.shift() ?? [initial, action, false]);
  return {...actual, useActionState: reactState.useActionState};
});

import {LandingPartnerForm} from "@/components/admin/landing-partner-form";
import {PartnerForm, PartnerLifecycleControls} from "@/components/admin/partner-form";

const partnerLabels = en.Admin.partners as unknown as Record<string, string>;
const landingLabels = en.Admin.landingPartners as unknown as Record<string, string>;

describe("rendered partner forms", () => {
  beforeEach(() => { reactState.results = []; reactState.useActionState.mockClear(); });

  it("retains every general-partner field and wires every inline error accessibly", () => {
    const names = ["nameEn", "nameZhHk", "category", "websiteUrl", "logoMediaId", "displayOrder", "featured", "relationshipStartsOn", "relationshipEndsOn", "relationshipConfirmed", "logoRightsConfirmed"];
    const values = {nameEn: "Retained", nameZhHk: "保留", category: "media", websiteUrl: " https://bad ", logoMediaId: "22222222-2222-4222-8222-222222222222", displayOrder: "9", featured: "on", relationshipStartsOn: "2026-08-29", relationshipEndsOn: "2026-08-28", relationshipConfirmed: "on", logoRightsConfirmed: ""};
    reactState.results.push([{status: "error", message: "Check fields", values, fieldErrors: Object.fromEntries(names.map((name) => [name, `error-${name}`]))}, vi.fn(), false]);
    render(<PartnerForm action={vi.fn()} labels={partnerLabels} mediaRows={[{id: values.logoMediaId, altEn: "Logo", altZh: "標誌"}]}/>);
    for (const name of names) {
      const control = document.querySelector(`[name="${name}"]`);
      expect(control).toHaveAttribute("aria-invalid", "true");
      expect(control).toHaveAttribute("aria-describedby", `${name}-error`);
      expect(screen.getByText(`error-${name}`)).toHaveAttribute("id", `${name}-error`);
    }
    expect(document.querySelector('[name="featured"]')).toBeChecked();
    expect(document.querySelector('[name="relationshipConfirmed"]')).toBeChecked();
    expect(document.querySelector('[name="logoRightsConfirmed"]')).not.toBeChecked();
    fireEvent.click(document.querySelector('[name="featured"]')!);
    expect(document.querySelector('[name="featured"]')).not.toBeChecked();
    expect(screen.getByRole("alert")).toHaveTextContent("Check fields");
  });

  it("retains every Launch Pad field and exposes every inline error", () => {
    const names = ["organizationEn", "organizationZhHk", "market", "region", "mouStatus", "contactJson", "notes"];
    const values = {organizationEn: "Bridge", organizationZhHk: "橋樑", market: "SG", region: "Asia", mouStatus: "signed", contactJson: "{bad", notes: "Private"};
    reactState.results.push([{status: "error", message: "Check landing", values, fieldErrors: Object.fromEntries(names.map((name) => [name, `error-${name}`]))}, vi.fn(), false]);
    render(<LandingPartnerForm action={vi.fn()} labels={landingLabels}/>);
    for (const name of names) {
      const control = document.querySelector(`[name="${name}"]`);
      expect(control).toHaveAttribute("aria-invalid", "true");
      expect(control).toHaveAttribute("aria-describedby", `${name}-error`);
      expect(screen.getByText(`error-${name}`)).toHaveAttribute("id", `${name}-error`);
    }
    expect(document.querySelector('[name="contactJson"]')).toHaveValue("{bad");
    expect(screen.getByRole("alert")).toHaveTextContent("Check landing");
  });

  it("renders invalid lifecycle state and disables impossible transitions", () => {
    reactState.results.push([{status: "invalid"}, vi.fn(), false], [{status: "idle"}, vi.fn(), false]);
    render(<PartnerLifecycleControls publishAction={vi.fn()} archiveAction={vi.fn()} published={false} archived labels={{publish: "Publish", unpublish: "Unpublish", archive: "Archive", unarchive: "Restore", saving: "Saving", invalid: "Unpublish before changing archive state.", error: "Try again"}}/>);
    expect(screen.getByRole("button", {name: "Publish"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "Restore"})).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Unpublish before changing archive state.");
  });
});

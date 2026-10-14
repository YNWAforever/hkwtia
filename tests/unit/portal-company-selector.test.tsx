import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import {CompanyFormScope, CompanySelector} from "@/components/portal/company-selector";

describe("company selection preserves unsaved input on cancellation", () => {
  it("asks before leaving an edited form and restores the current company when cancelled", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      render(<CompanyFormScope>
        <CompanySelector action="/portal/company" companyId="a" choices={[{id: "a", displayName: "Alpha"}, {id: "b", displayName: "Bravo"}]} labels={{choose: "Choose", use: "Switch", changeWarning: "Discard changes?"}} />
        <form><label htmlFor="name">Name</label><input id="name" name="displayName" defaultValue="Alpha" /></form>
      </CompanyFormScope>);
      fireEvent.change(screen.getByLabelText("Name"), {target: {value: "Unsaved Alpha"}});
      fireEvent.change(screen.getByLabelText("Choose"), {target: {value: "b"}});
      expect(fireEvent.submit(screen.getByRole("button", {name: "Switch"}).closest("form")!)).toBe(false);
      expect(confirm).toHaveBeenCalledWith("Discard changes?");
      expect(screen.getByLabelText("Choose")).toHaveValue("a");
      expect(screen.getByLabelText("Name")).toHaveValue("Unsaved Alpha");
    } finally { confirm.mockRestore(); }
  });
});

import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

const navigate = vi.hoisted(() => ({prevented: vi.fn()}));
vi.mock("next/link", () => ({default: ({children, href, onNavigate, ...props}: {children: React.ReactNode; href: string; onNavigate?: (event: {preventDefault: () => void}) => void}) => <a href={href} onClick={event => onNavigate?.({preventDefault: () => {navigate.prevented(); event.preventDefault();}})} {...props}>{children}</a>}));

import {AdminUnsavedChangesProvider, GuardedAdminLink, useAdminUnsavedChanges} from "@/components/admin/unsaved-changes-guard";

function Editor() {
  const {setDirty} = useAdminUnsavedChanges();
  return <button onClick={() => setDirty(true)} type="button">Edit draft</button>;
}

describe("admin unsaved form navigation", () => {
  it("keeps the draft when a sidebar navigation is cancelled and warns on reload", () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    navigate.prevented.mockClear();
    render(<AdminUnsavedChangesProvider confirmMessage="Leave draft?"><Editor/><GuardedAdminLink href="/admin/news">News</GuardedAdminLink></AdminUnsavedChangesProvider>);
    fireEvent.click(screen.getByRole("button", {name: "Edit draft"}));
    const unload = new Event("beforeunload", {cancelable: true});
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("link", {name: "News"}));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(navigate.prevented).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
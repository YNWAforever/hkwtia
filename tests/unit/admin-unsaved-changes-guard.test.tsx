import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Link from "next/link";

const navigate = vi.hoisted(() => ({ prevented: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onNavigate,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    onNavigate?: (event: { preventDefault: () => void }) => void;
  }) => (
    <a
      href={href}
      onClick={(event) =>
        onNavigate?.({
          preventDefault: () => {
            navigate.prevented();
            event.preventDefault();
          },
        })
      }
      {...props}
    >
      {children}
    </a>
  ),
}));

import {
  AdminUnsavedChangesProvider,
  GuardedAdminLink,
  useAdminUnsavedChanges,
} from "@/components/admin/unsaved-changes-guard";

function Editor() {
  const { setDirty } = useAdminUnsavedChanges();
  return (
    <button onClick={() => setDirty(true)} type="button">
      Edit draft
    </button>
  );
}

describe("admin unsaved form navigation", () => {
  it("keeps the draft when a sidebar navigation is cancelled and warns on reload", () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    navigate.prevented.mockClear();
    render(
      <AdminUnsavedChangesProvider confirmMessage="Leave draft?">
        <Editor />
        <GuardedAdminLink href="/admin/news">News</GuardedAdminLink>
      </AdminUnsavedChangesProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit draft" }));
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("link", { name: "News" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(navigate.prevented).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
  it("also protects direct links inside an editor page", () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    render(
      <AdminUnsavedChangesProvider confirmMessage="Leave draft?">
        <Editor />
        <Link href="/admin/news">Direct page link</Link>
      </AdminUnsavedChangesProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit draft" }));
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    screen.getByRole("link", { name: "Direct page link" }).dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
function SeparateEditor({ label }: { label: string }) {
  const { setDirty } = useAdminUnsavedChanges();
  return (
    <>
      <button onClick={() => setDirty(true)}>{label} edit</button>
      <button onClick={() => setDirty(false)}>{label} saved</button>
    </>
  );
}
it("saving one editor cannot clear another editor's unsaved protection", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(
    <AdminUnsavedChangesProvider confirmMessage="Keep unsaved editors">
      <SeparateEditor label="Case" />
      <SeparateEditor label="Draft" />
      <GuardedAdminLink href="/admin/tasks">Other route</GuardedAdminLink>
    </AdminUnsavedChangesProvider>,
  );
  fireEvent.click(screen.getByText("Case edit"));
  fireEvent.click(screen.getByText("Draft edit"));
  fireEvent.click(screen.getByText("Draft saved"));
  fireEvent.click(screen.getByText("Other route"));
  expect(confirm).toHaveBeenCalledWith("Keep unsaved editors");
});

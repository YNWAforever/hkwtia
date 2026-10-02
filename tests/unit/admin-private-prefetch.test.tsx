import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import type {ReactNode} from "react";

vi.mock("next/link", () => ({default: ({children, href, prefetch}: {children:ReactNode;href:string;prefetch?:boolean|"auto"|null}) => <a href={href} data-prefetch={String(prefetch ?? "auto")}>{children}</a>}));
import {GuardedAdminLink} from "@/components/admin/unsaved-changes-guard";

describe("private admin navigation", () => {
  it.each([undefined, true] as const)("waits for navigation even when caller prefetch is %s", (prefetch) => {
    render(<GuardedAdminLink href="/admin/members" prefetch={prefetch}>Members</GuardedAdminLink>);
    expect(screen.getByRole("link", {name:"Members"})).toHaveAttribute("data-prefetch", "false");
  });
});

import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import type {ReactNode} from "react";

vi.mock("next/link", () => ({default: ({children, href, prefetch}: {children: ReactNode; href: string; prefetch?: boolean | "auto" | null}) => <a href={href} data-prefetch={String(prefetch ?? "auto")}>{children}</a>}));
import {InboxList} from "@/components/admin/inbox-list";

const labels = {owner: "Owner", channel: "Channel", last: "Last", when: "When", messages: "Messages", status: "Status", handling: "Handling", assignee: "Assignee", unread: "Unread", anonymous: "Anonymous", unassigned: "Unassigned", unreadYes: "Unread", escalated: "Escalated", empty: "Empty", open: "Open", filters: {all: "All", whatsapp: "WhatsApp", web: "Web"}, handlingValues: {bot: "Bot", human: "Human", closed: "Closed"}, handlingFilters: {all: "All", human: "Human", bot: "Bot"}};

describe("private inbox filters", () => {
  it.each(["en", "zh-HK"] as const)("waits for navigation before fetching filtered records in %s", (locale) => {
    render(<InboxList locale={locale} rows={[]} labels={labels} channel="all" handling="all" />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(6);
    for (const link of links) {
      expect(link).toHaveAttribute("data-prefetch", "false");
      expect(link.getAttribute("href")).toMatch(locale === "en" ? /^\/admin\/inbox\?/ : /^\/zh\/admin\/inbox\?/);
    }
  });
});

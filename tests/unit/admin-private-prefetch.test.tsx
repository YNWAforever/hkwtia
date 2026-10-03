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

import {DashboardTiles} from "@/components/admin/dashboard-tiles";
import {WorkQueueTable} from "@/components/admin/work-queue-table";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

describe("private dashboard entry points", () => {
  it.each(["en", "zh-HK"] as const)("waits for intentional navigation in %s", (locale) => {
    const labels=locale==="en"?en.Admin.workQueue:zh.Admin.workQueue;
    render(<><DashboardTiles locale={locale} tiles={[{id:"review",href:"/admin/profiles-review",label:"Profile review",count:1}]} labels={{heading:"Queues",description:"Current queues",view:"Open",unavailable:"Unavailable",applicationQueue:"Applications"}}/>
      <WorkQueueTable locale={locale} scope="mine" cursor="synthetic-current" labels={labels} page={{nextCursor:"synthetic-next",items:[{id:"synthetic-draft",kind:"content",summary:"Private draft",ownerProfileId:null,ownerName:null,dueAt:null,nextActionCode:"edit_private_copy",href:"/admin/page-copy/Home",priority:"normal",sourceStatus:"draft"}]}}/></>);
    const links=screen.getAllByRole("link");
    expect(links).toHaveLength(8);
    for(const link of links)expect(link).toHaveAttribute("data-prefetch","false");
  });
});

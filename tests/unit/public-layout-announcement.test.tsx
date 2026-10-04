import {renderToStaticMarkup} from "react-dom/server";
import {cloneElement,isValidElement,Suspense,type ReactElement,type ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {ScheduledAnnouncementProjection} from "@/lib/public-shell/announcement";

const announcements = vi.hoisted(() => ({getActive: vi.fn()}));
const barState = vi.hoisted(() => ({
  announcement: null as Record<string, unknown> | null,
  dismissLabel: "",
  hasAnnouncement: undefined as boolean | undefined,
}));

vi.mock("@/lib/db/repos/announcements", () => ({announcementsRepository: announcements}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (input: {namespace: string}) => {
    const translate = (key: string) => key;
    return input.namespace === "Concierge" ? Object.assign(translate, {raw: (key: string) => key}) : translate;
  },
  setRequestLocale: () => undefined,
}));
vi.mock("@/lib/config/env", () => ({publicEnv: () => ({})}));
vi.mock("@/components/ai/deferred-concierge-widget", () => ({DeferredConciergeWidget: () => <div data-shell="concierge" />}));
vi.mock("@/components/layout/site-footer", () => ({SiteFooter: () => <footer>Footer</footer>}));
vi.mock("@/components/layout/site-header", () => ({
  SiteHeader: (props: {hasAnnouncement?: boolean}) => {
    barState.hasAnnouncement = props.hasAnnouncement;
    return <header>Header</header>;
  },
}));
vi.mock("@/components/layout/announcement-bar", () => ({
  AnnouncementBar: ({announcement, dismissLabel}: {announcement: {id: string; href: string; text: string; ctaLabel: string} | null; dismissLabel: string}) => {
    barState.announcement = announcement;
    barState.dismissLabel = dismissLabel;
    return announcement ? <aside>{announcement.text} {announcement.ctaLabel}</aside> : null;
  },
}));

const activeProjection: ScheduledAnnouncementProjection = {
  id: "11111111-1111-4111-8111-111111111111",
  title: {en: "Applications are open", "zh-HK": "現正接受申請"},
  ctaLabel: {en: "View programme", "zh-HK": "查看計劃"},
  href: "/launchpad",
  startsAt: "2026-08-29T00:00:00.000Z",
  endsAt: "2026-08-30T00:00:00.000Z",
  priority: 20,
};

async function resolveTree(node:ReactNode):Promise<ReactNode>{
  if(Array.isArray(node))return Promise.all(node.map(resolveTree));
  if(!isValidElement(node))return node;
  const element=node as ReactElement<{children?:ReactNode}>;
  if(typeof element.type === "function")return resolveTree(await (element.type as (props:object)=>Promise<ReactNode>)(element.props));
  return "children" in element.props?cloneElement(element,{children:await resolveTree(element.props.children)}):element;
}
async function renderPublicLayout(locale: "en" | "zh-HK"): Promise<string> {
  const {default: PublicLayout} = await import("@/app/[locale]/(public)/layout");
  return renderToStaticMarkup(await resolveTree(await PublicLayout({children: <p>Shell remains available</p> as ReactNode, params: Promise.resolve({locale})})));
}

describe("public layout announcement cutover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    barState.announcement = null;
  });

  it("passes the active safe announcement to AnnouncementBar and hides it on a read failure", async () => {
    announcements.getActive.mockResolvedValueOnce(activeProjection);
    const rendered = await renderPublicLayout("en");

    expect(rendered).toContain(activeProjection.title.en);
    expect(rendered).toContain(activeProjection.ctaLabel.en);
    expect(announcements.getActive).toHaveBeenCalledWith(expect.any(Date));
    expect(barState.announcement).toEqual({
      id: activeProjection.id,
      href: activeProjection.href,
      text: activeProjection.title.en,
      ctaLabel: activeProjection.ctaLabel.en,
    });
    expect(barState.announcement).not.toHaveProperty("startsAt");
    expect(barState.announcement).not.toHaveProperty("endsAt");
    expect(barState.announcement).not.toHaveProperty("priority");
    expect(barState.dismissLabel).toBe("dismiss");
    expect(barState.hasAnnouncement).toBe(true);

    announcements.getActive.mockRejectedValueOnce(new Error("database"));
    await expect(renderPublicLayout("en")).resolves.toContain("Shell remains available");
    expect(barState.announcement).toBeNull();
    expect(barState.hasAnnouncement).toBe(false);

    announcements.getActive.mockResolvedValueOnce({...activeProjection, title: {en: "", "zh-HK": ""}});
    await renderPublicLayout("en");
    expect(barState.announcement).toBeNull();
  });
});

it("returns the main shell while the announcement database read is pending",async()=>{
  let release!:()=>void;
  const pending=new Promise<void>(resolve=>{release=resolve;});
  announcements.getActive.mockImplementationOnce(async()=>{await pending;return null;});
  const {default:PublicLayout}=await import("@/app/[locale]/(public)/layout");
  const response=PublicLayout({children:<p>Immediate hero</p>,params:Promise.resolve({locale:"en"})});
  const ready=await Promise.race([response.then(()=>true),new Promise<boolean>(resolve=>setTimeout(()=>resolve(false),100))]);
  release();await response;
  expect(ready).toBe(true);
});

it("keeps the temporary header navigation disabled until the stable header replaces it",async()=>{
  const {default:PublicLayout}=await import("@/app/[locale]/(public)/layout");
  const tree=await PublicLayout({children:<p>Immediate hero</p>,params:Promise.resolve({locale:"en"})});
  const boundary=tree.props.children.find((node:ReactNode)=>isValidElement(node)&&node.type===Suspense) as ReactElement<{fallback:ReactElement<{navigationPending?:boolean}>}>;
  expect(boundary).toBeDefined();
  expect(boundary.props.fallback.props.navigationPending).toBe(true);
});

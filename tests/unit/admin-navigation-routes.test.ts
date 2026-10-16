// @vitest-environment node
import {readdirSync} from "node:fs";
import {join,relative,resolve} from "node:path";
import {describe,expect,it} from "vitest";
import {adminNavigationGroups} from "@/config/internal-navigation";

function routes(directory:string,root=directory):string[]{
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const path=join(directory,entry.name);
    if(entry.isDirectory())return routes(path,root);
    if(entry.name!=="page.tsx")return [];
    const segments=relative(root,directory).split(/[\\/]/).filter(part=>!part.startsWith("(")&&part!=="[locale]");
    return ["/"+segments.join("/")];
  });
}
const exists=(href:string,pages:ReadonlySet<string>)=>pages.has(new URL(href,"https://example.test").pathname);
describe("discoverable admin destinations",()=>{
  it("resolves every configured destination to an existing page, including query and fragment links",()=>{
    const links=adminNavigationGroups.flatMap(group=>[...group.links]);
    const pages=new Set(routes(resolve("app")));
    expect(links.length).toBeGreaterThanOrEqual(25);
    expect(pages.size).toBeGreaterThan(80);
    expect(links.filter(link=>!exists(link.href,pages)).map(link=>link.id)).toEqual([]);
  });
  it("detects missing routes and accepts an existing route with a health anchor",()=>{
    const pages=new Set(["/admin/automations"]);
    expect(exists("/admin/system/job-health",pages)).toBe(false);
    expect(exists("/admin/automations#verified-worker-health",pages)).toBe(true);
    expect(exists("/admin/automations?cursor=synthetic",pages)).toBe(true);
  });
});

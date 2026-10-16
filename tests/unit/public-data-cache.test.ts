// @vitest-environment node
await vi.hoisted(async()=>{const {AsyncLocalStorage}=await import("node:async_hooks");Object.assign(globalThis,{AsyncLocalStorage});});
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {nextDataCacheStore} from "@/tests/helpers/next-data-cache";
const state=vi.hoisted(()=>({invalidate:vi.fn(),copy:vi.fn()}));
vi.mock("@/lib/db/repos/page-copy",()=>({listPageCopyForLocale:state.copy}));
import {publicPostsRepository,listPublishedNews} from "@/lib/db/repos/public-posts";
import {pageCopyOverrides,clearPageCopyCache} from "@/lib/i18n/page-copy-cache";
import {revalidatePublicNews} from "@/lib/news/revalidate";
vi.mock("next/cache",async importOriginal=>({...await importOriginal<typeof import("next/cache")>(),revalidateTag:state.invalidate,revalidatePath:vi.fn()}));
let store:ReturnType<typeof nextDataCacheStore>;
beforeEach(()=>{store=nextDataCacheStore();Object.assign(globalThis,{__incrementalCache:store});state.invalidate.mockReset().mockImplementation((tag:string)=>store.expire(tag));state.copy.mockReset();});
afterEach(()=>{vi.restoreAllMocks();Reflect.deleteProperty(globalThis,"__incrementalCache");});
describe("public Next data cache",()=>{
  it("shares news reads by locale and limit, revives dates, and invalidates after a CMS edit",async()=>{
    const read=vi.spyOn(publicPostsRepository,"listPublishedNews").mockImplementation(async(locale,_date,options)=>[{slug:"public-news",title:`${locale}-${options?.limit??"all"}`,author:"Editorial",publishedAt:new Date("2026-09-01Z")}]);
    expect((await listPublishedNews("en",undefined,{limit:1}))[0]?.title).toBe("en-1");
    expect((await listPublishedNews("en",undefined,{limit:1}))[0]?.publishedAt).toBeInstanceOf(Date);
    expect(read).toHaveBeenCalledTimes(1);
    expect((await listPublishedNews("zh-HK",undefined,{limit:1}))[0]?.title).toBe("zh-HK-1");
    expect((await listPublishedNews("en",undefined,{limit:2}))[0]?.title).toBe("en-2");
    expect(read).toHaveBeenCalledTimes(3);
    read.mockResolvedValue([{slug:"public-news",title:"Edited",author:"Editorial",publishedAt:new Date("2026-09-01Z")}]);
    revalidatePublicNews("public-news");
    expect((await listPublishedNews("en",undefined,{limit:1}))[0]?.title).toBe("Edited");
    expect(state.invalidate).toHaveBeenCalledWith("public-news",{expire:0});
  });
  it("stores page copy in the framework cache and clears every locale on save",async()=>{
    state.copy.mockImplementation(async(locale:string)=>[{namespace:"Privacy",keyPath:"title",value:locale}]);
    clearPageCopyCache();
    expect((await pageCopyOverrides("en"))[0]?.value).toBe("en");
    expect((await pageCopyOverrides("zh-HK"))[0]?.value).toBe("zh-HK");
    expect(store.entries.size).toBe(2);
    await pageCopyOverrides("en");expect(state.copy).toHaveBeenCalledTimes(2);
    state.copy.mockResolvedValue([{namespace:"Privacy",keyPath:"title",value:"Edited"}]);
    clearPageCopyCache();
    expect((await pageCopyOverrides("en"))[0]?.value).toBe("Edited");
    expect((await pageCopyOverrides("zh-HK"))[0]?.value).toBe("Edited");
    expect(state.invalidate).toHaveBeenCalledWith("public-page-copy",{expire:0});
  });
  it("does not cache a database failure as an empty published feed",async()=>{
    const read=vi.spyOn(publicPostsRepository,"listPublishedNews").mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue([]);
    await expect(listPublishedNews("en")).rejects.toThrow("unavailable");
    await expect(listPublishedNews("en")).resolves.toEqual([]);
    expect(read).toHaveBeenCalledTimes(2);
  });
});

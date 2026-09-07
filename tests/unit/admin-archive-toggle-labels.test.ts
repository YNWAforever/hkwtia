import {describe, expect, it} from "vitest";

import {toArchiveInUseMessage} from "@/lib/admin/archive-toggle-labels";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

describe("toArchiveInUseMessage", () => {
  it("passes real Admin.media/Admin.news archiveInUse values through untouched, in both bundles", () => {
    expect(toArchiveInUseMessage(en.Admin.media.archiveInUse)).toBe(en.Admin.media.archiveInUse);
    expect(toArchiveInUseMessage(en.Admin.news.archiveInUse)).toBe(en.Admin.news.archiveInUse);
    expect(toArchiveInUseMessage(zh.Admin.media.archiveInUse)).toBe(zh.Admin.media.archiveInUse);
    expect(toArchiveInUseMessage(zh.Admin.news.archiveInUse)).toBe(zh.Admin.news.archiveInUse);
  });

  it("falls back to the bare placeholder when the value is not a string containing {count}", () => {
    expect(toArchiveInUseMessage(undefined)).toBe("{count}");
    expect(toArchiveInUseMessage("still in use")).toBe("{count}");
    expect(toArchiveInUseMessage(7)).toBe("{count}");
    expect(toArchiveInUseMessage(null)).toBe("{count}");
  });
});

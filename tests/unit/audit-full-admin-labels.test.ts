import {expect,it} from "vitest";
import {groupLabelKeys,linkLabelKeys} from "@/components/admin/admin-nav";
import en from "@/messages/en.json";import zh from "@/messages/zh-HK.json";
function label(bundle:unknown,path:string):unknown{return path.split(".").reduce<unknown>((value,key)=>value&&typeof value==="object"?(value as Record<string,unknown>)[key]:undefined,bundle);}
it("resolves every configured navigation label in both shipped bundles",()=>{const keys=[...Object.values(groupLabelKeys),...Object.values(linkLabelKeys)];expect(keys.length).toBeGreaterThanOrEqual(31);for(const bundle of [en.Admin,zh.Admin])for(const key of keys)expect(label(bundle,key),key).toBeTypeOf("string");});
it("detects missing and non-string labels rather than treating their keys as labels",()=>{expect(label({jobHealth:{heading:"Health"}},"jobHealth.heading")).toBe("Health");expect(label({jobHealth:{heading:"Health"}},"jobHealth.title")).toBeUndefined();expect(label({jobHealth:{heading:3}},"jobHealth.heading")).not.toBeTypeOf("string");});

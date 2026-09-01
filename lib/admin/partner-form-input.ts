import {z} from "zod";

const raw = (data: FormData, name: string) => String(data.get(name) ?? "");
const text = (data: FormData, name: string) => raw(data, name).trim();
function integer(data: FormData, name: string): number { const valueText = text(data, name); const value = Number(valueText); if (!valueText || !Number.isInteger(value)) throw new z.ZodError([{code: z.ZodIssueCode.custom, path: [name], message: "PARTNER_INTEGER_INVALID"}]); return value; }

export function partnerFormInput(data: FormData) {
  return {nameEn: text(data, "nameEn"), nameZhHk: text(data, "nameZhHk"), category: text(data, "category"), websiteUrl: raw(data, "websiteUrl"), logoMediaId: text(data, "logoMediaId"), displayOrder: integer(data, "displayOrder"), featured: data.get("featured") === "on", relationshipStartsOn: text(data, "relationshipStartsOn"), relationshipEndsOn: text(data, "relationshipEndsOn"), relationshipConfirmed: data.get("relationshipConfirmed") === "on", logoRightsConfirmed: data.get("logoRightsConfirmed") === "on"};
}

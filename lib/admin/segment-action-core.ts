import {segmentSaveSchema, type SegmentSaveInput} from "@/lib/admin/segment-schema";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";

export type SegmentSaveActionState = Readonly<{
  status?: "success" | "error";
  message?: string;
  fields?: Readonly<{nameEn: string; nameZh: string}>;
  fieldErrors?: Readonly<Partial<Record<"nameEn" | "nameZh" | "filter", string>>>;
}>;
export type SegmentSaveActionMessages = Readonly<{success: string; validation: string; error: string}>;

type Options = Readonly<{messages: SegmentSaveActionMessages; mutate: (input: SegmentSaveInput) => Promise<unknown>}>;

function field(formData: FormData, name: "nameEn" | "nameZh"): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.slice(0, 500) : "";
}

export async function runSegmentSaveAction(_state: SegmentSaveActionState, formData: FormData, options: Options): Promise<SegmentSaveActionState> {
  const fields = {nameEn: field(formData, "nameEn"), nameZh: field(formData, "nameZh")};
  const rawFilters = formData.get("filters");
  let filter: unknown;
  if (typeof rawFilters !== "string" || rawFilters.length > 20_000) {
    return {status: "error", message: options.messages.validation, fields, fieldErrors: {filter: options.messages.validation}};
  }
  try { filter = JSON.parse(rawFilters); }
  catch { return {status: "error", message: options.messages.validation, fields, fieldErrors: {filter: options.messages.validation}}; }

  const parsed = segmentSaveSchema.safeParse({nameEn: fields.nameEn, nameZh: fields.nameZh.trim() ? fields.nameZh : null, filter});
  if (!parsed.success) {
    const fieldErrors: Partial<Record<"nameEn" | "nameZh" | "filter", string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "nameEn" || key === "nameZh" || key === "filter") fieldErrors[key] = options.messages.validation;
    }
    return {status: "error", message: options.messages.validation, fields, fieldErrors};
  }
  try {
    await options.mutate(parsed.data);
    return {status: "success", message: options.messages.success, fields: {nameEn: "", nameZh: ""}};
  } catch (error) {
    if (isAuthorizationDenial(error)) throw error;
    return {status: "error", message: options.messages.error, fields};
  }
}

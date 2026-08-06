export type MediaFormInput = Readonly<{url: string; altEn: string; altZh: string}>;

/** Explicit field names, so nothing else in the form body can reach the repository. */
export function mediaFormInput(formData: FormData): MediaFormInput {
  return {
    url: String(formData.get("url") ?? "").trim(),
    altEn: String(formData.get("altEn") ?? "").trim(),
    altZh: String(formData.get("altZh") ?? "").trim(),
  };
}

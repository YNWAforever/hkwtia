import { draftFactLabels } from "./fact-labels";
import type { ApprovedFactPack } from "./contracts";
/** Supported public fields are implementation contracts, not approved association policy. */
export const publicFactFormats = {
  membershipFee: "money",
  ticketPrice: "money",
  capacity: "count",
  deadline: "date",
  eventDate: "date",
  eventTime: "text",
  venue: "text",
  membershipStatus: "text",
  paymentStatus: "text",
  eligibility: "boolean",
} as const;
export function publicFactValues(
  sourceId: string,
  locale: "en" | "zh-HK",
  structured: Readonly<Record<string, unknown>>,
): ApprovedFactPack["values"] {
  const labels = draftFactLabels(locale);
  const values: ApprovedFactPack["values"] = {};
  for (const [field, format] of Object.entries(publicFactFormats)) {
    const value = structured[field];
    if (value === undefined) continue;
    if (
      !(format === "money" || format === "count"
        ? typeof value === "number" && Number.isFinite(value)
        : format === "boolean"
          ? typeof value === "boolean"
          : typeof value === "string" && value.length <= 500)
    )
      throw Error("CONCIERGE_FACT_FORMAT_INVALID");
    const currency = structured.currency;
    if (format === "money" && currency !== "HKD" && currency !== "USD")
      throw Error("CONCIERGE_FACT_CURRENCY_REQUIRED");
    values[field] = {
      value: value as string | number | boolean,
      sourceId,
      label: labels[field as keyof typeof publicFactFormats],
      format,
      ...(format === "money" ? { currency: currency as "HKD" | "USD" } : {}),
    };
  }
  return values;
}

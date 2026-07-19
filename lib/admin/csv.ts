import type {SegmentMember} from "@/lib/admin/segments";

const header = ["profileId", "displayName", "email", "companyName", "planCode", "membershipStatus", "renewalAt", "score"] as const;

function neutralizeFormula(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const normalized = neutralizeFormula(String(value));
  return /[",\r\n]/.test(normalized) ? `"${normalized.replaceAll('"', '""')}"` : normalized;
}

export function encodeMemberCsv(members: readonly SegmentMember[], includeHeader = true): string {
  const lines = members.map((member) => [
    member.profileId,
    member.displayName,
    member.email,
    member.companyName,
    member.planCode,
    member.membershipStatus,
    member.renewalAt,
    member.score,
  ].map(csvCell).join(","));
  const output = [...(includeHeader ? [header.join(",")] : []), ...lines].join("\r\n");
  return `${includeHeader ? "\uFEFF" : ""}${output}${output ? "\r\n" : ""}`;
}

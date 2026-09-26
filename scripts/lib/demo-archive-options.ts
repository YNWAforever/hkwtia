export type DemoArchiveMode = "dry-run" | "unpublish" | "restore";
export type DemoArchiveOptions = Readonly<{mode: DemoArchiveMode; approvedIds: readonly string[]}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseDemoArchiveOptions(input: Readonly<{mode?: string; approvedIds?: string}>): DemoArchiveOptions {
  const mode = input.mode ?? "dry-run";
  if (mode !== "dry-run" && mode !== "unpublish" && mode !== "restore") throw new Error("DEMO_ARCHIVE_MODE_INVALID");
  if (mode === "dry-run") return {mode, approvedIds: []};
  const approvedIds = (input.approvedIds ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (approvedIds.length === 0) throw new Error("DEMO_APPROVED_IDS_REQUIRED");
  if (approvedIds.length > 20 || approvedIds.some((id) => !UUID.test(id)) || new Set(approvedIds).size !== approvedIds.length) {
    throw new Error("DEMO_APPROVED_IDS_INVALID");
  }
  return {mode, approvedIds};
}

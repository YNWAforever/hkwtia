import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireAdminActor } from "@/lib/auth/actor";
import { memberImportRepository } from "@/lib/db/repos/member-imports";
import { csvCell } from "@/lib/admin/csv";

type Props = Readonly<{ params: Promise<{ id: string }> }>;
/** Private correction report. Original source row numbers remain stable; no member data is exported. */
export async function GET(
  request: Request,
  { params }: Props,
): Promise<Response> {
  const actor = await requireAdminActor().catch(() => null);
  if (!actor) return new Response(null, { status: 404 });
  const id = z
    .string()
    .uuid()
    .safeParse((await params).id);
  const query = new URL(request.url).searchParams;
  const locale = z.enum(["en", "zh-HK"]).safeParse(query.get("locale") ?? "en");
  if (
    !id.success ||
    !locale.success ||
    [...query.keys()].some((key) => key !== "locale") ||
    query.getAll("locale").length > 1
  )
    return new Response(null, { status: 404 });
  try {
    const rows = await memberImportRepository.issues(actor, id.data);
    const t = await getTranslations({
      locale: locale.data,
      namespace: "Admin.imports",
    });
    const lines = [
      [t("row"), t("status"), t("reason")].map(csvCell).join(","),
      ...rows.map((row) =>
        [
          row.rowNumber,
          t(row.status),
          row.reason && t.has(`reasons.${row.reason}`)
            ? t(`reasons.${row.reason}`)
            : t("unknownReason"),
        ]
          .map(csvCell)
          .join(","),
      ),
    ];
    return new Response(
      String.fromCharCode(0xfeff) + lines.join("\r\n") + "\r\n",
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="import-issues-${id.data}.csv"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      [
        "IMPORT_DISABLED",
        "IMPORT_RUN_EXPIRED",
        "IMPORT_RUN_UNAVAILABLE",
      ].includes(error.message)
    )
      return new Response(null, { status: 404 });
    return new Response(null, { status: 500 });
  }
}

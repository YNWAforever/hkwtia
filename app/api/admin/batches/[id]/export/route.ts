import {downloadMemberBatchCsv} from "@/lib/admin/batches/export";
import {requireAdminActor} from "@/lib/auth/actor";

type Props = Readonly<{params: Promise<{id: string}>}>;

export async function GET(_request: Request, {params}: Props): Promise<Response> {
  const actor = await requireAdminActor().catch(() => null);
  if (!actor) return new Response(null, {status: 404});
  const id = (await params).id;
  try {
    const file = await downloadMemberBatchCsv(actor, id);
    return new Response(file.csv, {headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="members-${id}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    }});
  } catch (error) {
    if (error instanceof Error && ["BATCH_NOT_FOUND", "EXPORT_EXPIRED", "EXPORT_UNAVAILABLE"].includes(error.message)) return new Response(null, {status: 404});
    if (error instanceof Error && ["EXPORT_INCOMPLETE", "EXPORT_CHANGED"].includes(error.message)) return new Response(null, {status: 409});
    return new Response(null, {status: 500});
  }
}

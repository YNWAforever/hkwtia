import {encodeMemberCsv} from "@/lib/admin/csv";
import {segmentIdSchema} from "@/lib/admin/segment-schema";
import {requireAdminActor} from "@/lib/auth/actor";
import {segmentsRepository} from "@/lib/db/repos/segments";

type Props = Readonly<{params: Promise<{id: string}>}>;

export async function GET(_request: Request, {params}: Props): Promise<Response> {
  const actor = await requireAdminActor().catch(() => null);
  const id = segmentIdSchema.safeParse((await params).id);
  if (!actor || !id.success) return new Response(null, {status: 404});
  const segment = await segmentsRepository.get(actor, id.data).catch(() => null);
  if (!segment) return new Response(null, {status: 404});

  const first = await segmentsRepository.preview(actor, segment.filters, {limit: 500, cursor: null});
  await segmentsRepository.auditExport(actor, segment.id, segment.filterVersion, first.total);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let page: typeof first | null = first;
        let header = true;
        while (page) {
          controller.enqueue(encoder.encode(encodeMemberCsv(page.items, header)));
          header = false;
          page = page.nextCursor ? await segmentsRepository.preview(actor, segment.filters, {limit: 500, cursor: page.nextCursor}) : null;
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return new Response(stream, {headers: {"Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="segment-${segment.id}.csv"`, "Cache-Control": "no-store"}});
}

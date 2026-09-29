import {z} from "zod";

import {requireAdminActor} from "@/lib/auth/actor";
import {adminBatchesRepository} from "@/lib/db/repos/admin-batches";

type Props = Readonly<{params: Promise<{id: string}>}>;

/** Poll one owner-scoped batch row; item details stay behind the paged page read. */
export async function GET(_request: Request, {params}: Props): Promise<Response> {
  const actor = await requireAdminActor().catch(() => null);
  if (!actor) return new Response(null, {status: 404, headers: {"Cache-Control": "private, no-store"}});
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return new Response(null, {status: 404, headers: {"Cache-Control": "private, no-store"}});
  try {
    const status = await adminBatchesRepository.status(actor, id.data);
    return Response.json(status, {headers: {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}});
  } catch (error) {
    const code = error instanceof Error && error.message === "BATCH_NOT_FOUND" ? 404 : 500;
    return new Response(null, {status: code, headers: {"Cache-Control": "private, no-store"}});
  }
}
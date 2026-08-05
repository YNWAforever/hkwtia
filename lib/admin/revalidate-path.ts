import "server-only";

import {revalidatePath} from "next/cache";
import {z} from "zod";

// Both locale conventions in use: `/en/admin/...` from template literals and
// `/admin/...` | `/zh/admin/...` from localizedPath.
const adminPathSchema = z.string().max(200).regex(
  /^(?:\/(?:en|zh|zh-HK))?\/admin(?:\/[A-Za-z0-9-]+)*$/,
  "INVALID_REVALIDATE_PATH",
);

/**
 * Server Action arguments are supplied by the client, so the path to
 * revalidate is untrusted. Confine invalidation to the admin surface and skip
 * it entirely for anything else rather than failing a mutation that already
 * succeeded.
 */
export function revalidateAdminPath(path: string): boolean {
  const parsed = adminPathSchema.safeParse(path);
  if (!parsed.success) return false;
  revalidatePath(parsed.data);
  return true;
}

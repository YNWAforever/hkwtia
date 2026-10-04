import "server-only";
import type { ReactNode } from "react";
/** Server-only read boundary; no caching, new query or client-side data transfer. */
export async function AwaitReadModel<T>({
  pending,
  children,
}: {
  pending: Promise<T>;
  children: (value: T) => ReactNode;
}) {
  return children(await pending);
}

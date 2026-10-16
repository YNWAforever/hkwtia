import type {ReactNode} from "react";

/** Internal tables may scroll inside this frame; the document itself must never overflow. */
export function InternalTableFrame({children}: Readonly<{children: ReactNode}>) {
  return (
    <div data-internal-table-frame className="overflow-x-auto rounded-md border">
      {children}
    </div>
  );
}

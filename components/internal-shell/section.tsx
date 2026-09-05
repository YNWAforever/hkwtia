import type {ReactNode} from "react";

export function InternalSection({title, children}: Readonly<{title: string; children: ReactNode}>) {
  return (
    <section className="mb-8 space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

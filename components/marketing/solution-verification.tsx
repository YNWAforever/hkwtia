import {CardGrid} from "@/components/wt/card-grid";
import {Shell} from "@/components/wt/shell";
import {StatusLabel} from "@/components/wt/status-label";
import type {WtCard} from "@/components/wt/types";

export function SolutionVerification({label, title, copy, badges}: Readonly<{label: string; title: string; copy: string; badges: readonly WtCard[]}>) {
  return <section className="solution-verification">
    <Shell>
      <StatusLabel as="p">{label}</StatusLabel>
      <h2>{title}</h2>
      <p>{copy}</p>
      <CardGrid items={badges} variant="badge" />
    </Shell>
  </section>;
}

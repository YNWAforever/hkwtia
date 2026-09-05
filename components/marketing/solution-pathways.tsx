import {ActionLink} from "@/components/wt/action-link";
import {Shell} from "@/components/wt/shell";
import {StatusLabel} from "@/components/wt/status-label";

export type SolutionPathwayPanel = Readonly<{label: string; title: string; copy: string; action: string; href: string}>;

export function SolutionPathways({buyer, provider}: Readonly<{buyer: SolutionPathwayPanel; provider: SolutionPathwayPanel}>) {
  return <section aria-label="Showcase pathways">
    <Shell>
      <div className="solution-pathways">
        {[buyer, provider].map((panel) => (
          <article key={panel.href}>
            <StatusLabel>{panel.label}</StatusLabel>
            <h2>{panel.title}</h2>
            <p>{panel.copy}</p>
            <ActionLink href={panel.href} variant="button-dark">{panel.action}</ActionLink>
          </article>
        ))}
      </div>
    </Shell>
  </section>;
}

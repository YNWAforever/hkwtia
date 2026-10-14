import {ActionLink} from '@/components/wt/action-link';
import {StatusLabel} from '@/components/wt/status-label';

type NextStepProps = Readonly<{
  label: string;
  title: string;
  body: string;
  context?: string;
  additional?: Readonly<{label: string; items: readonly Readonly<{id: string; title: string; context: string}>[]}>;
  action?: Readonly<{href: string; label: string}>;
  progress?: Readonly<{summary: string; steps: readonly Readonly<{label: string; done: boolean}>[]}>;
}>;

// Purely presentational: the page maps a PortalNextStep to copy and href. Same ink grammar as
// the public honest-empty block, minus its live-region role -- this is a standing call to
// action, not a state that changes under the reader.
export function NextStep({label, title, body, context, additional, action, progress}: NextStepProps) {
  return (
    <section className="honest-empty portal-next-step">
      <span className="pulse-ring" aria-hidden="true" />
      <div>
        <StatusLabel as="p">{label}</StatusLabel>
        <h2>{title}</h2>
        {context ? <p>{context}</p> : null}
        <p>{body}</p>
        {additional ? (
          <div className="mt-4">
            <h3 className="font-semibold">{additional.label}</h3>
            <ul className="mt-2 space-y-2">
              {additional.items.map((item) => <li key={item.id}><p>{item.context}</p><p>{item.title}</p></li>)}
            </ul>
          </div>
        ) : null}
        {progress ? (
          <ol className="portal-steps" aria-label={progress.summary}>
            {progress.steps.map((step) => (
              <li key={step.label} className={step.done ? 'portal-step done' : 'portal-step'}>
                {step.label}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      {action ? (
        <div className="open-now-actions">
          <ActionLink href={action.href} variant="button-light" prefetch={false}>{action.label}</ActionLink>
        </div>
      ) : null}
    </section>
  );
}

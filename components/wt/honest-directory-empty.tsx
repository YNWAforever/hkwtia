import {ActionLink} from "@/components/wt/action-link";
import type {WtAction} from "@/components/wt/types";

type HonestDirectoryEmptyProps = Readonly<{
  status: string;
  next: string;
  primary: WtAction;
  secondary: WtAction;
  /** Dashed consent/reserved slots. Labels only — never a face, logo, or invented name. */
  frames?: readonly string[];
}>;

/**
 * Honest empty directory (Catherine Phase 3, SPECS §6). Says what is actually
 * published and what has to happen before anything appears. No stock people,
 * no 「WTIA 認證」, no fabricated cards.
 */
export function HonestDirectoryEmpty({status, next, primary, secondary, frames = []}: HonestDirectoryEmptyProps) {
  return (
    <div className="directory-empty" role="status" aria-live="polite">
      <h3>{status}</h3>
      <p>{next}</p>
      {frames.length > 0 ? (
        <ul aria-hidden="true" className="directory-empty-frames">
          {frames.map((label, index) => (
            <li key={`${index}-${label}`}>{label}</li>
          ))}
        </ul>
      ) : null}
      <div className="directory-empty-actions">
        <ActionLink href={primary.href} variant="button-dark">{primary.label}</ActionLink>
        <ActionLink className="directory-empty-secondary" href={secondary.href} variant="button">{secondary.label}</ActionLink>
      </div>
    </div>
  );
}

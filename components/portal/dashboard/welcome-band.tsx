import {StatusLabel} from '@/components/wt/status-label';

type WelcomeBandProps = Readonly<{greeting: string; companyName?: string; planLabel: string; statusLabel: string}>;

// A member with no company yet gets no company line at all (never an empty element).
export function WelcomeBand({greeting, companyName, planLabel, statusLabel}: WelcomeBandProps) {
  return (
    <header className="portal-welcome">
      <h1>{greeting}</h1>
      {companyName ? <p className="portal-welcome-company">{companyName}</p> : null}
      <p className="portal-welcome-meta">
        <StatusLabel>{planLabel}</StatusLabel>
        <StatusLabel>{statusLabel}</StatusLabel>
      </p>
    </header>
  );
}

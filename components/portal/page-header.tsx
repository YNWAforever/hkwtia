import type {ReactNode} from 'react';

import {StatusLabel} from '@/components/wt/status-label';

type PortalPageHeaderProps = Readonly<{eyebrow?: string; title: string; lead?: string; children?: ReactNode}>;

// Same markup as the dashboard welcome band and the forms pages, so .portal-welcome styles all of them.
// `children` sits under the title for status lines and alerts.
export function PortalPageHeader({eyebrow, title, lead, children}: PortalPageHeaderProps) {
  return (
    <header className="portal-welcome">
      {eyebrow ? <StatusLabel>{eyebrow}</StatusLabel> : null}
      <h1>{title}</h1>
      {lead ? <p className="portal-welcome-lead">{lead}</p> : null}
      {children}
    </header>
  );
}

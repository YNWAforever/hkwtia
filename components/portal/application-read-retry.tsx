import {PrivateLink} from "@/components/internal-shell/private-link";
import {PortalPageHeader} from "@/components/portal/page-header";

export function ApplicationReadRetry({
  title,
  message,
  retryHref,
  retryLabel,
  dashboardHref,
  dashboardLabel,
}: Readonly<{
  title: string;
  message: string;
  retryHref: string;
  retryLabel: string;
  dashboardHref: string;
  dashboardLabel: string;
}>) {
  return (
    <div className="space-y-6">
      <PortalPageHeader title={title} />
      <section className="glass-card space-y-4 p-5 sm:p-6" role="alert">
        <p>{message}</p>
        <div className="flex flex-wrap gap-3">
          <a className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" href={retryHref}>
            {retryLabel}
          </a>
          <PrivateLink className="portal-button-outline min-h-11" href={dashboardHref}>
            {dashboardLabel}
          </PrivateLink>
        </div>
      </section>
    </div>
  );
}

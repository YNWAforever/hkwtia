import {PrivateLink} from "@/components/internal-shell/private-link";
import type {AppLocale} from "@/i18n/routing";
import {formatPortalDate} from "@/lib/portal/format-date";
import {localizedPath} from "@/lib/urls";

export type FirstMemberResult =
  | Readonly<{kind: "event"; title: string; description: string; startsAt: string; venue: string | null; href: string}>
  | Readonly<{kind: "member"; name: string; jobTitle: string | null; company: string | null; href: string}>
  | Readonly<{kind: "empty"}>
  | Readonly<{kind: "unavailable"; reference: string}>;

type Labels = Readonly<{
  title: string; event: string; member: string; viewEvent: string; viewMember: string;
  empty: string; unavailable: string; browseEvents: string; retry: string;
}>;

export function FirstResult({result, locale, labels}: {result: FirstMemberResult; locale: AppLocale; labels: Labels}) {
  const action = result.kind === "event" ? {href: result.href, label: labels.viewEvent}
    : result.kind === "member" ? {href: result.href, label: labels.viewMember}
    : result.kind === "unavailable" ? {href: "/portal", label: labels.retry}
    : {href: "/portal/events", label: labels.browseEvents};
  return (
    <section className="portal-glance space-y-4" aria-labelledby="first-result-title">
      <h2 id="first-result-title">{labels.title}</h2>
      {result.kind === "event" ? (
        <div className="space-y-2">
          <p className="status-label">{labels.event}</p>
          <h3 className="break-words font-serif text-2xl font-semibold">{result.title}</h3>
          <p className="text-sm text-muted-foreground">
            <time dateTime={result.startsAt}>{formatPortalDate(locale, result.startsAt)}</time>
            {result.venue ? <span>{" \u00b7 "}{result.venue}</span> : null}
          </p>
          <p className="line-clamp-3 whitespace-pre-line break-words">{result.description}</p>
        </div>
      ) : result.kind === "member" ? (
        <div className="space-y-2">
          <p className="status-label">{labels.member}</p>
          <h3 className="break-words font-serif text-2xl font-semibold">{result.name}</h3>
          {result.jobTitle || result.company ? <p>{[result.jobTitle, result.company].filter(Boolean).join(" \u00b7 ")}</p> : null}
        </div>
      ) : <p role={result.kind === "unavailable" ? "status" : undefined}>{labels[result.kind]}</p>}
      <PrivateLink className="portal-button-outline inline-flex min-h-11 items-center justify-center" href={localizedPath(locale, action.href)}>{action.label}</PrivateLink>
    </section>
  );
}

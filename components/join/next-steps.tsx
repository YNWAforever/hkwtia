import {MEMBERSHIP_KIT_LINKS, publishedMembershipKitHref, type MembershipKitLinks} from "@/config/membership-journey";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

type Variant = "individual" | "organisation";

type Labels = Readonly<{
  title: string;
  lead: string;
  noPayment: string;
  welcomeKit: string;
  associationKit: string;
  login: string;
  whatsapp: string;
  whatsappCommunity: string;
  events: string;
}>;

function ExternalLink({href, children}: Readonly<{href: string; children: string}>) {
  return <a className="text-link" href={href} rel="noopener noreferrer" target="_blank">{children}</a>;
}

/** Confirmation next steps. Server-rendered; the join shell already has the form's client bundle. */
export function JoinNextSteps({
  locale,
  variant,
  labels,
  kitLinks = MEMBERSHIP_KIT_LINKS,
}: Readonly<{locale: AppLocale; variant: Variant; labels: Labels; kitLinks?: MembershipKitLinks}>) {
  const login = localizedPath(locale, "/member-login");
  const profile = localizedPath(locale, "/portal/profile");
  const events = localizedPath(locale, "/events");
  const welcomeKit = publishedMembershipKitHref(kitLinks.welcomeKit);
  const associationKit = publishedMembershipKitHref(kitLinks.associationKit);
  const whatsappCommunity = publishedMembershipKitHref(kitLinks.whatsappCommunity);
  return (
    <section className="mt-8 border-t border-border pt-6">
      <h2 className="font-serif text-2xl font-semibold">{labels.title}</h2>
      <p className="mt-3 text-muted-foreground">{labels.lead}</p>
      {variant === "organisation" ? <p className="mt-3 text-muted-foreground">{labels.noPayment}</p> : null}
      <ul className="mt-4 space-y-3">
        {welcomeKit ? <li><ExternalLink href={welcomeKit}>{labels.welcomeKit}</ExternalLink></li> : null}
        {associationKit ? <li><ExternalLink href={associationKit}>{labels.associationKit}</ExternalLink></li> : null}
        <li><a className="text-link" href={login}>{labels.login}</a></li>
        <li>
          <a className="text-link" href={profile}>{labels.whatsapp}</a>
          {whatsappCommunity ? <>{" "}<ExternalLink href={whatsappCommunity}>{labels.whatsappCommunity}</ExternalLink></> : null}
        </li>
        <li><a className="text-link" href={events}>{labels.events}</a></li>
      </ul>
    </section>
  );
}

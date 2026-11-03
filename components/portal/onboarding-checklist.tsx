import {PrivateLink} from "@/components/internal-shell/private-link";
import {MEMBERSHIP_KIT_LINKS, publishedMembershipKitHref, type MembershipKitLinks} from "@/config/membership-journey";
import type {OnboardingChecklistItem} from "@/lib/portal/onboarding-checklist";
import {localizedPath} from "@/lib/urls";
import type {AppLocale} from "@/i18n/routing";

type Labels = Readonly<{
  title: string;
  lead: string;
  kitsTitle: string;
  kitsLead: string;
  done: string;
  todo: string;
  items: Readonly<Record<OnboardingChecklistItem["id"], string>>;
  welcomeKit: string;
  associationKit: string;
  whatsappCommunity: string;
}>;

function KitLink({href, children}: Readonly<{href: string; children: string}>) {
  return <a className="text-link" href={href} rel="noopener noreferrer" target="_blank">{children}</a>;
}

function publishedKitEntries(links: MembershipKitLinks, labels: Labels) {
  return (
    [
      ["welcomeKit", labels.welcomeKit],
      ["associationKit", labels.associationKit],
      ["whatsappCommunity", labels.whatsappCommunity],
    ] as const
  ).flatMap(([id, label]) => {
    const href = publishedMembershipKitHref(links[id]);
    return href ? [{id, href, label}] : [];
  });
}

export function OnboardingChecklist({
  locale,
  items,
  labels,
  kitLinks = MEMBERSHIP_KIT_LINKS,
}: Readonly<{locale: AppLocale; items: readonly OnboardingChecklistItem[]; labels: Labels; kitLinks?: MembershipKitLinks}>) {
  const kits = publishedKitEntries(kitLinks, labels);
  return (
    <section className="onboarding-checklist space-y-6" aria-labelledby="onboarding-checklist-title">
      <div>
        <h2 id="onboarding-checklist-title" className="font-serif text-2xl font-semibold">{labels.title}</h2>
        <p className="mt-2 text-muted-foreground">{labels.lead}</p>
        <ul className="mt-4 space-y-3">
          {items.map((item) => {
            const label = labels.items[item.id];
            const externalHref = item.external ? publishedMembershipKitHref(item.href) : null;
            if (item.external && !externalHref) return null;
            const state = item.done ? labels.done : labels.todo;
            const control = externalHref
              ? <KitLink href={externalHref}>{label}</KitLink>
              : <PrivateLink className="text-link" href={localizedPath(locale, item.href)}>{label}</PrivateLink>;
            return (
              <li className="flex flex-wrap items-baseline gap-3" key={item.id}>
                <span className="text-sm text-muted-foreground">{state}</span>
                {control}
              </li>
            );
          })}
        </ul>
      </div>
      {kits.length > 0 ? (
        <div>
          <h3 className="font-semibold">{labels.kitsTitle}</h3>
          <p className="mt-2 text-muted-foreground">{labels.kitsLead}</p>
          <ul className="mt-3 space-y-2">
            {kits.map((kit) => <li key={kit.id}><KitLink href={kit.href}>{kit.label}</KitLink></li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

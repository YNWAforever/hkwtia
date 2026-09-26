import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {CheckoutStatus} from "@/components/billing/checkout-status";
import type {AppLocale} from "@/i18n/routing";
import {buildPageMetadata} from "@/lib/metadata";
import {getActor} from "@/lib/auth/actor";
import {loadJoinCompletionState, type JoinCompletionDisplay} from "@/lib/membership/join-billing-state";
import {localizedPath} from "@/lib/urls";

type Props = Readonly<{
  params: Promise<{locale: string}>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function queryValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

// Mid-flow, member-specific step: keep it out of search results.
export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Join"});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/join/complete",
    title: t("metaTitle"),
    description: t("authDescription"),
    index: false,
  });
}

export default async function CompletePage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  const query = await searchParams;
  setRequestLocale(locale);

  const actor = await getActor().catch(() => null);
  const state = await loadJoinCompletionState(actor, queryValue(query.membership_id));
  if (!state) notFound();

  const t = await getTranslations("Join");
  // Map the webhook-authoritative display state to the same status.{key}.{title,description}
  // copy /join/page.tsx's own resumption rendering already uses for these three outcomes.
  const displayToMessageKey: Record<JoinCompletionDisplay, "complete" | "review" | "checkout" | "failed"> = {
    active: "complete",
    review: "review",
    processing: "checkout",
    failed: "failed",
  };
  const messageKey = displayToMessageKey[state.display];
  return (
    <section className="glass-card p-6 sm:p-10">
      <h1 className="font-serif text-4xl font-semibold">{t(`status.${messageKey}.title`)}</h1>
      <div className="mt-4 text-muted-foreground">
        <CheckoutStatus
          labels={{
            processing: t("checkoutSummary.processing"),
            active: t("status.complete.description"),
            review: t("status.review.description"),
            failed: t("status.failed.description"),
          }}
          status={state.display}
          statusUrl={`/api/membership/checkout-status?${new URLSearchParams({membershipId: state.membership.id})}`}
          timeoutLabel={t("checkoutSummary.stillProcessing")}
          portal={{href: localizedPath(locale, "/portal"), label: t("checkoutSummary.openPortal")}}
          review={{href: `${localizedPath(locale, "/join")}?${new URLSearchParams({plan: state.membership.planCode, application: state.application.id})}`, label: t("checkoutSummary.reviewNext")}}
          manualCheck={{href: `${localizedPath(locale, "/join/complete")}?${new URLSearchParams({membership_id: state.membership.id})}`, label: t("checkoutSummary.checkAgain")}}
          support={{href: localizedPath(locale, "/contact"), label: t("checkoutSummary.contactSupport")}}
        />
      </div>
    </section>
  );
}

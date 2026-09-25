import Link from "next/link";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {MEMBER_TOOLS} from "@/config/member-tools";
import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {memberToolsEnv} from "@/lib/config/env";
import {isToolAvailable, toolFrameSrc} from "@/lib/portal/member-tools";
import {getDashboard} from "@/lib/portal/queries";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string; key: string}>}>;

export default async function PortalToolPage({params}: Props) {
  const {locale: localeValue, key} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireActor();
  const tool = MEMBER_TOOLS.find((candidate) => candidate.key === key);
  if (!tool) notFound();
  const [dashboard, t] = await Promise.all([
    getDashboard(actor),
    getTranslations({locale, namespace: "Portal"}),
  ]);
  const available = isToolAvailable(tool, dashboard.memberships);

  if (!available) {
    return (
      <section className="glass-card max-w-2xl space-y-3 p-6">
        <h1 className="font-serif text-3xl font-semibold">{t(tool.titleKey)}</h1>
        <p className="font-medium">{t("tools.lockedTitle")}</p>
        <p className="text-muted-foreground">{t("tools.lockedDescription")}</p>
        <Link className="text-link" href={localizedPath(locale, "/membership")}>{t("tools.upgrade")}</Link>
      </section>
    );
  }

  // Fail closed rather than embed a tool we cannot authenticate: a frame that loads the
  // tool's 401 is worse than saying so, and a missing token must not 500 the portal.
  const token = memberToolsEnv()[tool.tokenField];
  if (!token) {
    return (
      <section className="glass-card max-w-2xl space-y-3 p-6">
        <h1 className="font-serif text-3xl font-semibold">{t(tool.titleKey)}</h1>
        <p className="font-medium">{t("tools.unavailableTitle")}</p>
        <p className="text-muted-foreground">{t("tools.unavailableDescription")}</p>
      </section>
    );
  }

  // No `sandbox`: the framed document is cross-origin, so the browser already isolates it
  // from our origin and DOM. A sandbox without `allow-same-origin` would give it an opaque
  // origin and stop it sending its SameSite=None; Partitioned auth cookie, and with it the
  // attribute is all but a no-op for a cross-origin frame. `referrerPolicy="no-referrer"`
  // keeps the token-bearing URL out of the Referer.
  return (
    <iframe
      className="h-[calc(100dvh-8rem)] w-full rounded-lg border border-border"
      referrerPolicy="no-referrer"
      src={toolFrameSrc(tool, token)}
      title={t(tool.titleKey)}
    />
  );
}

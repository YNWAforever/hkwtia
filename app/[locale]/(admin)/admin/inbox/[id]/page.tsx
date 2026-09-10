import Link from "next/link";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {InboxThread} from "@/components/admin/inbox-thread";
import type {AppLocale} from "@/i18n/routing";
import {readTranscript} from "@/lib/admin/inbox";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {localizedPath} from "@/lib/urls";

type Props = Readonly<{params: Promise<{locale: string; id: string}>}>;

export default async function AdminInboxThreadPage({params}: Props) {
  const {locale: localeValue, id} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const t = await getTranslations({locale, namespace: "Admin.inbox"});
  const transcript = await readTranscript(actor, id).catch(() => null);
  if (!transcript) notFound();
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <Link className="text-sm text-primary underline" href={localizedPath(locale, "/admin/inbox")}>{t("back")}</Link>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">{transcript.conversation.ownerLabel ?? t("anonymous")}</h1>
        <p className="text-muted-foreground">{transcript.conversation.channel} · {transcript.conversation.messageCount}</p>
      </header>
      <InboxThread labels={{roles: {user: t("roles.user"), assistant: t("roles.assistant"), tool: t("roles.tool"), staff: t("roles.staff")}}} locale={locale} transcript={transcript} />
    </div>
  );
}

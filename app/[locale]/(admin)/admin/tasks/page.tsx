import {getTranslations, setRequestLocale} from "next-intl/server";

import {TaskTable} from "@/components/admin/task-table";
import type {AppLocale} from "@/i18n/routing";
import {listOpenTasks} from "@/lib/admin/inbox";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {resolveStaffTaskAction} from "@/lib/admin/task-actions";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function AdminTasksPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const t = await getTranslations({locale, namespace: "Admin.tasks"});
  const header = <header className="space-y-3"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1><p className="text-lg text-muted-foreground">{t("description")}</p></header>;
  let tasks;
  try {
    tasks = await listOpenTasks(actor);
  } catch {
    return <div className="space-y-8">{header}<p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-4 text-destructive" role="alert">{t("error")}</p></div>;
  }
  return <div className="space-y-8">{header}<TaskTable action={resolveStaffTaskAction} labels={{kind: t("columns.kind"), summary: t("columns.summary"), member: t("columns.member"), conversation: t("columns.conversation"), created: t("columns.created"), actions: t("columns.actions"), resolve: t("resolve"), openConversation: t("openConversation"), empty: t("empty")}} locale={locale} tasks={tasks} /></div>;
}

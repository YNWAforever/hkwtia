import {AiReviewPanel,type AiDraftReviewLabels} from "@/components/admin/ai-review-panel";
import {aiDraftsRepository} from "@/lib/db/repos/ai-drafts";
import {PrivateLink} from "@/components/internal-shell/private-link";
import {localizedPath} from "@/lib/urls";
import {z} from "zod";
import type en from "@/messages/en.json";
import { SUPPORT_NEXT_ACTIONS } from "@/lib/admin/support-followup-types";
import { APPLICATION_NEXT_ACTIONS } from "@/lib/admin/application-case-types";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { TaskTable } from "@/components/admin/task-table";
import type { AppLocale } from "@/i18n/routing";
import { listOpenTasks } from "@/lib/admin/inbox";
import { requireAdminPageActor } from "@/lib/admin/page-auth";
import { resolveStaffTaskAction } from "@/lib/admin/task-actions";

type Props = Readonly<{ params: Promise<{ locale: string }>;searchParams?:Promise<{draft?:string;after?:string}> }>;

export default async function AdminTasksPage({ params,searchParams }: Props) {
  const { locale: localeValue } = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const t = await getTranslations({ locale, namespace: "Admin.tasks" });
  const supportT = await getTranslations({
    locale,
    namespace: "Admin.inbox.followUp",
  });
  const caseT = await getTranslations({
    locale,
    namespace: "Admin.applicationCase",
  });
  const header = (
    <header className="space-y-3">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">
        {t("eyebrow")}
      </p>
      <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
        {t("title")}
      </h1>
      <p className="text-lg text-muted-foreground">{t("description")}</p>
    </header>
  );
  let tasks;
  try {
    tasks = await listOpenTasks(actor);
  } catch {
    return (
      <div className="space-y-8">
        {header}
        <p
          className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-4 text-destructive"
          role="alert"
        >
          {t("error")}
        </p>
      </div>
    );
  }
  const reviewT=await getTranslations({locale,namespace:"AiDraftReview"});
  const enabled=process.env.ADMIN_AI_DRAFTS_ENABLED==="true";
  let reviewQueue:Awaited<ReturnType<typeof aiDraftsRepository.listReviewQueue>>|null=null;
  let detail:Awaited<ReturnType<typeof aiDraftsRepository.getDraft>>|null=null;
  let reviewError=false;
  const query=await searchParams??{};
  if(enabled){try{
   if(query.draft&&!z.string().uuid().safeParse(query.draft).success)throw Error("AI_DRAFT_ID_INVALID");
   reviewQueue=await aiDraftsRepository.listReviewQueue(actor,{...(query.after?{after:query.after}:{})});
   if(query.draft)detail=await aiDraftsRepository.getDraft(actor,query.draft);
  }catch{reviewError=true;}}
  const labels=Object.fromEntries(Object.keys((await import("@/messages/en.json")).default.AiDraftReview).map(key=>[key,reviewT(key as keyof typeof en.AiDraftReview)])) as AiDraftReviewLabels;
  return (
    <div className="space-y-8">
      {header}
      <TaskTable
        action={resolveStaffTaskAction}
        labels={{
          owner: supportT("owner"),
          due: supportT("due"),
          unassigned: supportT("unassigned"),
          supportCase: supportT("title"),
          supportNextActions: Object.fromEntries(
            SUPPORT_NEXT_ACTIONS.map((key) => [
              key,
              supportT(`nextActions.${key}`),
            ]),
          ),
          applicationCase: caseT("title"),
          openApplicationCase: caseT("open"),
          caseNextActions: Object.fromEntries(
            APPLICATION_NEXT_ACTIONS.map((key) => [
              key,
              caseT(`nextActions.${key}`),
            ]),
          ),
          kind: t("columns.kind"),
          summary: t("columns.summary"),
          member: t("columns.member"),
          conversation: t("columns.conversation"),
          created: t("columns.created"),
          actions: t("columns.actions"),
          resolve: t("resolve"),
          openConversation: t("openConversation"),
          empty: t("empty"),
          leadEmail: t("leadEmail"),
          leadEmailBlocked: t("leadEmailBlocked"),
          leadEmailUncertain: t("leadEmailUncertain"),
          leadAck: t("leadAck"),
          leadStaff: t("leadStaff"),
          ticketEmail: t("ticketEmail"),
          ticketEmailBlocked: t("ticketEmailBlocked"),
          ticketEmailUncertain: t("ticketEmailUncertain"),
          ticketRefundPending: t("ticketRefundPending"),
          ticketConfirmation: t("ticketConfirmation"),
          ticketPass: t("ticketPass"),
          ticketRefund: t("ticketRefund"),
          ticketRefundFailed: t("ticketRefundFailed"),
          ticketOrder: t("ticketOrder"),
        }}
        locale={locale}
        tasks={tasks}
      />
      <section aria-labelledby="ai-draft-queue" className="space-y-4">
       <h2 id="ai-draft-queue" className="text-xl font-semibold">{reviewT("heading")}</h2>
       {!enabled?<p>{reviewT("disabled")} {reviewT("manualFallback")}</p>:reviewError?<p role="alert">{reviewT("unavailable")}</p>:reviewQueue?.items.length?<ul className="space-y-2">{reviewQueue.items.map(item=><li key={item.id} className="rounded-lg border border-border p-3"><PrivateLink href={localizedPath(locale,`/admin/tasks?draft=${item.id}`)} className="underline">{reviewT("open")} · {reviewT(item.state)} · {reviewT("version")} {item.version}</PrivateLink><p className="mt-1 break-all text-sm">{reviewT("owner")}: {item.ownerId??reviewT("noValue")}</p></li>)}</ul>:<p>{reviewT("empty")}</p>}
       {reviewQueue?.nextCursor?<PrivateLink href={localizedPath(locale,`/admin/tasks?after=${reviewQueue.nextCursor}`)} className="underline">{reviewT("next")}</PrivateLink>:null}
      </section>
      {detail?<AiReviewPanel key={`${detail.draft.id}:${detail.draft.version}`} details={detail} labels={labels} enabled={enabled}/>:null}
    </div>
  );
}

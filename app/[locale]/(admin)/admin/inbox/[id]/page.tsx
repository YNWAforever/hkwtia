import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import {getSession} from "@/lib/auth/server";
import {inboxDraftScope,inboxDraftProtectionConfigured} from "@/lib/admin/inbox-draft-protection";
import {protectInboxDraftAction,restoreInboxDraftAction} from "@/lib/admin/inbox-draft-actions";
import {aiDraftsRepository} from "@/lib/db/repos/ai-drafts";
import {supportDraftConfiguration} from "@/lib/ai/support-drafts";
import {supportCaseId} from "@/lib/ai/drafts/support-facts";
import {SupportDraftPanel,type SupportAssistance} from "@/components/admin/support-draft-panel";
import {z} from "zod";
import {
  SupportFollowUpForm,
  type SupportFollowUpLabels,
} from "@/components/admin/support-follow-up-form";
import {
  SUPPORT_NEXT_ACTIONS,
  SUPPORT_CLOSE_REASONS,
} from "@/lib/admin/support-followup-types";
import { inboxRepository } from "@/lib/db/repos/inbox";
import { adminMembersRepository } from "@/lib/db/repos/admin-members";
import {PrivateLink as Link} from "@/components/internal-shell/private-link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { WHATSAPP_TEMPLATES } from "@/config/whatsapp-templates";
import { InboxComposer } from "@/components/admin/inbox-composer";
import { InboxThread } from "@/components/admin/inbox-thread";
import type { AppLocale } from "@/i18n/routing";
import { readTranscript } from "@/lib/admin/inbox";
import {
  formatReplyWindow,
  replyWindow,
  INBOX_REPLY_ERROR_CODES,
  type InboxReplyErrorCode,
} from "@/lib/admin/inbox-action-core";
import {
  markInboxReadAction,
  sendInboxReplyAction,
  updateSupportFollowUpAction,
} from "@/lib/admin/inbox-actions";
import { requireAdminPageActor } from "@/lib/admin/page-auth";
import { localizedPath } from "@/lib/urls";
import { approvedTemplateKeys } from "@/lib/whatsapp/approved-templates";

type Props = Readonly<{ params: Promise<{ locale: string; id: string }>;searchParams?:Promise<{draft?:string}> }>;

export default async function AdminInboxThreadPage({ params,searchParams }: Props) {
  const { locale: localeValue, id } = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const t = await getTranslations({ locale, namespace: "Admin.inbox" });
  const transcript = await readTranscript(actor, id);
  if (!transcript) notFound();
  const conversation = transcript.conversation;
  const session=await getSession();
  const scope=session?inboxDraftScope(actor.profileId,actor.userId,session.session.id):"";
  const supportLabels=(locale==="zh-HK"?zh:en).SupportAssistance as SupportAssistance["labels"];
  const enabled=process.env.ADMIN_AI_DRAFTS_ENABLED==="true";
  let configured=false;try{const config=supportDraftConfiguration();configured=config.ready;}catch{/* Safe manual fallback. */}
  let detail:SupportAssistance["draft"]=null,unavailable=false;
  const query=await searchParams??{};
  if(enabled&&query.draft){try{
    const draftId=z.string().uuid().parse(query.draft),loaded=await aiDraftsRepository.getDraft(actor,draftId);
    if(loaded.draft.kind!=="support"||loaded.draft.caseId!==supportCaseId(id))throw Error("SUPPORT_DRAFT_CASE_MISMATCH");
    detail=loaded;
  }catch{unavailable=true;}}
  const assistance:SupportAssistance={locale,labels:supportLabels,enabled,configured,draft:detail,unavailable};

  // The INTERNAL app-router path, which is where `/zh-HK/…` is the correct
  // spelling — `revalidatePath` does not go through `localizedPath`, and
  // `tests/unit/locale-href-boundary.test.ts` covers `href` attributes precisely
  // because this one argument is the exception.
  const path = "/" + locale + "/admin/inbox/" + conversation.id;

  // Not named `window`: this renders on the server, where shadowing the browser
  // global reads as a mistake even when it is not.
  const replyState = replyWindow(conversation.lastInboundAt);
  const countdown = formatReplyWindow(replyState);
  const windowMessage =
    replyState.state === "open"
      ? t("window.open", countdown)
      : t(`window.${replyState.state}`);

  // One call, one place, reading the same set as C1 Task 7's
  // TEMPLATE_NOT_APPROVED gate — a picker that offers a key the gate would
  // refuse is a picker that lies. C-7 (C2 Task 2) swapped the source for the
  // `whatsapp_templates` registry and made this `await`; the prop shape did not
  // change. The `await` is load-bearing: an unawaited `Promise<ReadonlySet<…>>`
  // has no `.has`, and spread through `Array.from` it would have offered an
  // empty picker with no type error.
  const approved = await approvedTemplateKeys();
  const templates = Object.keys(WHATSAPP_TEMPLATES)
    .filter((key): key is keyof typeof WHATSAPP_TEMPLATES =>
      approved.has(key as keyof typeof WHATSAPP_TEMPLATES) &&
      WHATSAPP_TEMPLATES[key as keyof typeof WHATSAPP_TEMPLATES].languageCode ===
        (conversation.locale === "zh-HK" ? "zh_HK" : "en_US"),
    )
    // The provider's own element name, not a translated label: it is the string
    // staff will read back in the WOZTELL console when a template is rejected.
    .map((key) => ({ key, label: WHATSAPP_TEMPLATES[key].name }));

  const errors = Object.fromEntries(
    INBOX_REPLY_ERROR_CODES.map((code) => [code, t(`errors.${code}`)]),
  ) as Record<InboxReplyErrorCode, string>;

  const followUp = await inboxRepository.getSupportFollowUp(actor, id);
  if (!followUp) notFound();
  const owners = await adminMembersRepository.listOperationOwners(actor);
  const followLabels: SupportFollowUpLabels = {
    title: t("followUp.title"),
    owner: t("followUp.owner"),
    unassigned: t("followUp.unassigned"),
    due: t("followUp.due"),
    next: t("followUp.next"),
    handling: t("followUp.handling"),
    closeReason: t("followUp.closeReason"),
    noClose: t("followUp.noClose"),
    application: t("followUp.application"),
    billing: t("followUp.billing"),
    reference: t("followUp.reference"),
    note: t("followUp.note"),
    privacy: t("followUp.privacy"),
    save: t("followUp.save"),
    saving: t("followUp.saving"),
    saved: t("followUp.saved"),
    conflict: t("followUp.conflict"),
    invalid: t("followUp.invalid"),
    unavailable: t("followUp.unavailable"),
    reload: t("followUp.reload"),
    nextActions: Object.fromEntries(
      SUPPORT_NEXT_ACTIONS.map((key) => [
        key,
        t(`followUp.nextActions.${key}`),
      ]),
    ),
    handlingValues: {
      bot: t("handling.bot"),
      human: t("handling.human"),
      closed: t("handling.closed"),
    },
    closeReasons: Object.fromEntries(
      SUPPORT_CLOSE_REASONS.map((key) => [
        key,
        t(`followUp.closeReasons.${key}`),
      ]),
    ),
  };
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  });

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <Link
          className="text-sm text-primary underline"
          href={localizedPath(locale, "/admin/inbox")}
        >
          {t("back")}
        </Link>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">
          {conversation.ownerLabel ?? t("anonymous")}
        </h1>
        <p className="text-muted-foreground">
          {conversation.channel} · {conversation.messageCount} ·{" "}
          {t(`handling.${conversation.handling}`)}
        </p>
        <p className="text-muted-foreground">
          {t("columns.assignee")}:{" "}
          {conversation.assigneeLabel ?? t("unassigned")}
        </p>
      </header>
      <div className="flex flex-wrap gap-3">
        {conversation.unread ? (
          <form action={markInboxReadAction.bind(null, path)}>
            <input
              name="conversationId"
              type="hidden"
              value={conversation.id}
            />
            <button
              className="min-h-11 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
              type="submit"
            >
              {t("actions.markRead")}
            </button>
          </form>
        ) : null}
      </div>
      <SupportFollowUpForm
        conversationId={id}
        value={followUp}
        owners={owners}
        channel={conversation.channel}
        labels={followLabels}
        action={updateSupportFollowUpAction.bind(null, path)}
      />
      <nav
        className="flex flex-wrap gap-4"
        aria-label={t("followUp.reference")}
      >
        {followUp.applicationId ? (
          <Link
            className="min-h-11 text-primary underline"
            href={localizedPath(
              locale,
              "/admin/members/queue/" + followUp.applicationId,
            )}
          >
            {t("followUp.openApplication")}
          </Link>
        ) : null}
        {followUp.billingAttemptId ? (
          <Link
            className="min-h-11 text-primary underline"
            href={localizedPath(
              locale,
              "/admin/members/" +
                encodeURIComponent(conversation.profileId ?? ""),
            )}
          >
            {t("followUp.openBilling")}
          </Link>
        ) : null}
        {followUp.nextActionCode==="delivery_reconciliation"?<Link className="min-h-11 text-primary underline" href={localizedPath(locale,"/admin/automations#verified-worker-health")}>{t("followUp.openDelivery")}</Link>:null}
      </nav>
      <section className="space-y-4 rounded-lg border p-4">
        <h2 className="font-serif text-2xl">{t("followUp.timeline")}</h2>
        {followUp.timeline.length ? (
          <ol className="space-y-4">
            {followUp.timeline.map((item) => (
              <li key={item.context.supportVersion} className="border-b pb-3">
                <time dateTime={item.at}>{date.format(new Date(item.at))}</time>
                <p>
                  {t(`followUp.nextActions.${item.context.nextActionCode}`)}
                </p>
                <p>
                  {t("followUp.owner")}:{" "}
                  {owners.find(
                    (owner) => owner.id === item.context.ownerProfileId,
                  )?.name ?? t("unassigned")}
                </p>
                <p className="whitespace-pre-wrap break-words">
                  {item.context.handoffNote}
                </p>
                {item.context.closeReason ? (
                  <p>
                    {t("followUp.closeReason")}:{" "}
                    {t(`followUp.closeReasons.${item.context.closeReason}`)}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p>{t("followUp.noHistory")}</p>
        )}
      </section>
      <InboxThread
        labels={{
          roles: {
            user: t("roles.user"),
            assistant: t("roles.assistant"),
            tool: t("roles.tool"),
            staff: t("roles.staff"),
          },
          delivery: {
            queued: t("delivery.queued"),
            sent: t("delivery.sent"),
            delivered: t("delivery.delivered"),
            read: t("delivery.read"),
            failed: t("delivery.failed"),
            uncertain: t("delivery.uncertain"),
            preflightBlocked: t("delivery.preflightBlocked"),
          },
        }}
        locale={locale}
        transcript={transcript}
      />
      {/* S-12: C1 replies into threads that already exist, and only on WhatsApp.
          The composer is hidden rather than disabled for a web thread or one the
          concierge still holds, because `sendInboxReply` refuses both outright
          (INVALID_INBOX_CHANNEL, INVALID_INBOX_HANDLING) and a box that can only
          produce an error is worse than no box. */}
      {conversation.channel === "whatsapp" &&
      conversation.handling === "human" ? (
        <InboxComposer
          key={scope+":"+id}
          assistance={assistance}
          draftProtection={scope?{scope,enabled:inboxDraftProtectionConfigured(),protect:protectInboxDraftAction,restore:restoreInboxDraftAction}:undefined}
          action={sendInboxReplyAction.bind(null, path)}
          conversationId={conversation.id}
          labels={{
            legend: t("compose.legend"),
            kindSession: t("compose.kindSession"),
            kindTemplate: t("compose.kindTemplate"),
            message: t("compose.message"),
            placeholder: t("compose.placeholder"),
            template: t("compose.template"),
            templateNone: t("compose.templateNone"),
            send: t("compose.send"),
            sending: t("compose.sending"),
            sent: t("compose.sent"),
            alreadySent: t("compose.alreadySent"),
            draftRestored: t("compose.draftRestored"),
            errors,
          }}
          templates={templates}
          windowMessage={windowMessage}
          windowState={replyState.state}
        />
      ) : <SupportDraftPanel conversationId={id} value={assistance}/>}
    </div>
  );
}

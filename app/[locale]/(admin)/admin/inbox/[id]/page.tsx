import Link from "next/link";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {WHATSAPP_TEMPLATES} from "@/config/whatsapp-templates";
import {InboxComposer} from "@/components/admin/inbox-composer";
import {InboxThread} from "@/components/admin/inbox-thread";
import type {AppLocale} from "@/i18n/routing";
import {readTranscript} from "@/lib/admin/inbox";
import {
  formatReplyWindow,
  replyWindow,
  INBOX_REPLY_ERROR_CODES,
  type InboxReplyErrorCode,
} from "@/lib/admin/inbox-action-core";
import {
  assignInboxConversationAction,
  closeInboxConversationAction,
  markInboxReadAction,
  sendInboxReplyAction,
  setInboxHandlingAction,
} from "@/lib/admin/inbox-actions";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {localizedPath} from "@/lib/urls";
import {approvedTemplateKeys} from "@/lib/whatsapp/approved-templates";

type Props = Readonly<{params: Promise<{locale: string; id: string}>}>;

export default async function AdminInboxThreadPage({params}: Props) {
  const {locale: localeValue, id} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const t = await getTranslations({locale, namespace: "Admin.inbox"});
  const transcript = await readTranscript(actor, id).catch(() => null);
  if (!transcript) notFound();
  const conversation = transcript.conversation;

  // The INTERNAL app-router path, which is where `/zh-HK/…` is the correct
  // spelling — `revalidatePath` does not go through `localizedPath`, and
  // `tests/unit/locale-href-boundary.test.ts` covers `href` attributes precisely
  // because this one argument is the exception.
  const path = "/" + locale + "/admin/inbox/" + conversation.id;

  // Not named `window`: this renders on the server, where shadowing the browser
  // global reads as a mistake even when it is not.
  const replyState = replyWindow(conversation.lastInboundAt);
  const countdown = formatReplyWindow(replyState);
  const windowMessage = replyState.state === "open"
    ? t("window.open", countdown)
    : t(`window.${replyState.state}`);

  // One call, one place, reading the same set as Task 7's TEMPLATE_NOT_APPROVED
  // gate — a picker that offers a key the gate would refuse is a picker that
  // lies. C-7 (C2 Task 2) swaps the source for the `whatsapp_templates` registry
  // and makes this `await`; the prop shape does not change.
  const approved = approvedTemplateKeys();
  const templates = Object.keys(WHATSAPP_TEMPLATES)
    .filter((key): key is keyof typeof WHATSAPP_TEMPLATES => approved.has(key as keyof typeof WHATSAPP_TEMPLATES))
    // The provider's own element name, not a translated label: it is the string
    // staff will read back in the WOZTELL console when a template is rejected.
    .map((key) => ({key, label: WHATSAPP_TEMPLATES[key].name}));

  const errors = Object.fromEntries(
    INBOX_REPLY_ERROR_CODES.map((code) => [code, t(`errors.${code}`)]),
  ) as Record<InboxReplyErrorCode, string>;

  const handlingForm = (handling: "bot" | "human", label: string) => (
    <form action={setInboxHandlingAction.bind(null, path)}>
      <input name="conversationId" type="hidden" value={conversation.id} />
      <input name="handling" type="hidden" value={handling} />
      <button className="min-h-11 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted" type="submit">{label}</button>
    </form>
  );

  const assignForm = (assignedToProfileId: string, label: string) => (
    <form action={assignInboxConversationAction.bind(null, path)}>
      <input name="conversationId" type="hidden" value={conversation.id} />
      <input name="assignedToProfileId" type="hidden" value={assignedToProfileId} />
      <button className="min-h-11 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted" type="submit">{label}</button>
    </form>
  );

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <Link className="text-sm text-primary underline" href={localizedPath(locale, "/admin/inbox")}>{t("back")}</Link>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">{conversation.ownerLabel ?? t("anonymous")}</h1>
        <p className="text-muted-foreground">{conversation.channel} · {conversation.messageCount} · {t(`handling.${conversation.handling}`)}</p>
        <p className="text-muted-foreground">{t("columns.assignee")}: {conversation.assigneeLabel ?? t("unassigned")}</p>
      </header>
      <div className="flex flex-wrap gap-3">
        {/* The same rule the composer below states, applied to the control that
            reaches it: `setHandling` refuses `human` on a thread that is not
            WhatsApp (INVALID_INBOX_CHANNEL, lib/db/repos/inbox.ts), and
            `setInboxHandlingAction` returns `void` — it has no `useActionState`
            channel to carry an error code back, so that refusal would replace
            the page with the generic error boundary and lose its state, on a
            button that could never have succeeded. `Admin.inbox.errors
            .INVALID_INBOX_CHANNEL` exists for the composer, which can show it.
            Release needs no such gate: handing a thread back is `handling='bot'`,
            which the repository accepts on either channel, and hiding it would
            strand any web thread that somehow already reads `human`. */}
        {conversation.handling === "human"
          ? handlingForm("bot", t("actions.release"))
          : conversation.channel === "whatsapp"
            ? handlingForm("human", t("actions.take"))
            : null}
        {conversation.assignedToProfileId === actor.profileId
          ? assignForm("", t("actions.unassign"))
          : assignForm(actor.profileId, t("actions.assignToMe"))}
        {conversation.unread ? (
          <form action={markInboxReadAction.bind(null, path)}>
            <input name="conversationId" type="hidden" value={conversation.id} />
            <button className="min-h-11 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted" type="submit">{t("actions.markRead")}</button>
          </form>
        ) : null}
        {conversation.handling === "closed" ? null : (
          <form action={closeInboxConversationAction.bind(null, path)}>
            <input name="conversationId" type="hidden" value={conversation.id} />
            <button className="min-h-11 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted" type="submit">{t("actions.close")}</button>
          </form>
        )}
      </div>
      <InboxThread
        labels={{
          roles: {user: t("roles.user"), assistant: t("roles.assistant"), tool: t("roles.tool"), staff: t("roles.staff")},
          delivery: {queued: t("delivery.queued"), sent: t("delivery.sent"), delivered: t("delivery.delivered"), read: t("delivery.read"), failed: t("delivery.failed")},
        }}
        locale={locale}
        transcript={transcript}
      />
      {/* S-12: C1 replies into threads that already exist, and only on WhatsApp.
          The composer is hidden rather than disabled for a web thread or one the
          concierge still holds, because `sendInboxReply` refuses both outright
          (INVALID_INBOX_CHANNEL, INVALID_INBOX_HANDLING) and a box that can only
          produce an error is worse than no box. */}
      {conversation.channel === "whatsapp" && conversation.handling === "human" ? (
        <InboxComposer
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
      ) : null}
    </div>
  );
}

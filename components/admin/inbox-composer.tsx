"use client";

import {useActionState, useEffect, useState} from "react";

import {WHATSAPP_TEMPLATES} from "@/config/whatsapp-templates";
import type {InboxReplyErrorCode, InboxReplyState} from "@/lib/admin/inbox-action-core";

/**
 * The staff reply box: the one `'use client'` file C-2 adds.
 *
 * The repo has ~40 client components and treats the count as a budget, so the
 * thread, the header and every take-over/assign/close form stay Server
 * Components with plain `<form action={…}>`. Only three things here genuinely
 * need the browser: the draft that survives a mis-click, the free-text/template
 * switch that decides which fields exist, and `useActionState`'s pending flag.
 *
 * Nothing here is a gate. The window countdown is formatted on the server and
 * the disabled button is a courtesy; `sendInboxReply` re-checks the window, the
 * channel, the handling state, consent and template approval against the row,
 * and the adapter checks the window again after that. A client that posts its
 * own `formData` gets the same answers.
 */
export type InboxComposerLabels = Readonly<{
  legend: string;
  kindSession: string;
  kindTemplate: string;
  message: string;
  placeholder: string;
  template: string;
  templateNone: string;
  send: string;
  sending: string;
  sent: string;
  draftRestored: string;
  errors: Readonly<Record<InboxReplyErrorCode, string>>;
}>;

export type InboxComposerTemplate = Readonly<{key: string; label: string}>;

type Kind = "session" | "template";

/** `restored` is a fact about `content`, so the two live together. */
type Draft = Readonly<{content: string; restored: boolean}>;

const EMPTY_DRAFT: Draft = {content: "", restored: false};

const initialState: InboxReplyState = {status: "idle"};

/**
 * Per thread, per tab, and deliberately `sessionStorage` rather than
 * `localStorage`: a half-written reply to a member is not something to leave on
 * a shared workstation after the tab closes.
 */
function draftKey(conversationId: string): string {
  return `wtia:inbox-draft:${conversationId}`;
}

/**
 * Every access is wrapped, and not out of superstition: reading or writing
 * `sessionStorage` THROWS — it does not return null — in a private window and
 * wherever site data is blocked. An unguarded read at mount takes the whole
 * composer down with it, which would mean staff cannot reply at all because a
 * convenience feature could not remember a draft.
 */
function readDraft(conversationId: string): string | null {
  try {
    return window.sessionStorage.getItem(draftKey(conversationId));
  } catch {
    return null;
  }
}

function writeDraft(conversationId: string, value: string): void {
  try {
    if (value === "") window.sessionStorage.removeItem(draftKey(conversationId));
    else window.sessionStorage.setItem(draftKey(conversationId), value);
  } catch {
    // Nothing to do and nothing to tell staff: the reply still sends.
  }
}

export function InboxComposer({
  action,
  conversationId,
  labels,
  templates,
  windowMessage,
  windowState,
}: Readonly<{
  action: (state: InboxReplyState, formData: FormData) => Promise<InboxReplyState>;
  conversationId: string;
  labels: InboxComposerLabels;
  templates: readonly InboxComposerTemplate[];
  /** Already formatted on the server, from the same constant the adapter enforces. */
  windowMessage: string;
  windowState: "open" | "closed" | "never";
}>) {
  const [kind, setKind] = useState<Kind>("session");
  const [templateKey, setTemplateKey] = useState("");
  // One piece of state, not two: the notice is a fact about the CONTENT — this
  // text came back from storage rather than from the keyboard — so the two can
  // never be updated apart, and every writer below is a single `setDraft`.
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  // The draft is cleared HERE, in the submit, rather than in an effect watching
  // for `status === "sent"`: a sent reply is no longer a draft, and tying the
  // clear to the event that makes it true keeps the two from getting out of step
  // (an effect would also have to re-run for two identical sends in a row).
  const [state, formAction, pending] = useActionState(
    async (previous: InboxReplyState, formData: FormData): Promise<InboxReplyState> => {
      const result = await action(previous, formData);
      if (result.status === "sent") {
        writeDraft(conversationId, "");
        setDraft(EMPTY_DRAFT);
      }
      return result;
    },
    initialState,
  );

  useEffect(() => {
    const saved = readDraft(conversationId);
    if (saved === null || saved === "") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the browser-only sessionStorage API after mount, the same shape as components/layout/announcement-dismiss.tsx; reading it during render instead would mismatch the server-rendered markup, which never has a draft.
    setDraft({content: saved, restored: true});
  }, [conversationId]);

  // A free-text reply outside the window is refused by the server and by the
  // adapter. `never` is disabled alongside `closed`: a thread nobody has written
  // into has no window at all — which is every pre-deploy anonymous thread until
  // its next inbound message — and offering a reply there would only produce
  // WINDOW_CLOSED after the click.
  const windowBlocksSession = windowState !== "open";
  const variables = kind === "template" && Object.hasOwn(WHATSAPP_TEMPLATES, templateKey)
    // The approved KEYS come from the prop, which is the same
    // `approvedTemplateKeys()` the send gate reads. Only the ordered parameter
    // NAMES come from the config here, because `sendTemplateMessage` fills the
    // body positionally from exactly this list and an uncollected parameter is
    // sent as an empty string. C-7 (C2 Task 2) moves both to the registry.
    ? WHATSAPP_TEMPLATES[templateKey as keyof typeof WHATSAPP_TEMPLATES].variables
    : [];

  return (
    <form action={formAction} className="space-y-4 rounded-md border border-border p-4">
      <input name="conversationId" type="hidden" value={conversationId} />
      <fieldset className="space-y-3">
        <legend className="font-serif text-xl font-semibold">{labels.legend}</legend>
        <p className={windowState === "open" ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{windowMessage}</p>
        <div className="flex flex-wrap gap-4 text-sm">
          {([["session", labels.kindSession], ["template", labels.kindTemplate]] as const).map(([value, label]) => (
            <label className="flex items-center gap-2" key={value}>
              <input
                checked={kind === value}
                name="kind"
                onChange={() => setKind(value)}
                type="radio"
                value={value}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {kind === "template" ? (
          <label className="block space-y-2 text-sm font-medium" htmlFor="inbox-template">
            <span>{labels.template}</span>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2"
              id="inbox-template"
              name="templateKey"
              onChange={(event) => setTemplateKey(event.target.value)}
              required
              value={templateKey}
            >
              <option value="">{labels.templateNone}</option>
              {templates.map((template) => (
                <option key={template.key} value={template.key}>{template.label}</option>
              ))}
            </select>
          </label>
        ) : null}
        {variables.map((variable) => (
          <label className="block space-y-2 text-sm font-medium" htmlFor={`inbox-variable-${variable}`} key={variable}>
            <span>{variable}</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2"
              id={`inbox-variable-${variable}`}
              maxLength={1_000}
              name={`variable.${variable}`}
              required
              type="text"
            />
          </label>
        ))}
        <label className="block space-y-2 text-sm font-medium" htmlFor="inbox-content">
          <span>{labels.message}</span>
          <textarea
            className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2"
            id="inbox-content"
            maxLength={4_096}
            name="content"
            onChange={(event) => {
              // Typing retires the "draft restored" notice: it stops being true
              // the moment the text is the reader's own again.
              setDraft({content: event.target.value, restored: false});
              writeDraft(conversationId, event.target.value);
            }}
            placeholder={labels.placeholder}
            required
            value={draft.content}
          />
        </label>
      </fieldset>
      <button
        className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        disabled={pending || (kind === "session" && windowBlocksSession)}
        type="submit"
      >
        {pending ? labels.sending : labels.send}
      </button>
      <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role="status">
        {state.status === "error" && state.code !== undefined
          ? labels.errors[state.code]
          : state.status === "sent"
            ? labels.sent
            : draft.restored ? labels.draftRestored : ""}
      </p>
    </form>
  );
}

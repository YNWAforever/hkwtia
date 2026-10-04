"use client";

import {useActionState, useEffect, useState, useRef} from "react";

import {WHATSAPP_TEMPLATES} from "@/config/whatsapp-templates";
import type {InboxReplyErrorCode, InboxReplyState} from "@/lib/admin/inbox-action-core";
import {purgeLegacyInboxPlaintext,inboxDraftStorageGeneration} from "@/lib/admin/inbox-draft-storage";
import type {protectInboxDraftAction,restoreInboxDraftAction} from "@/lib/admin/inbox-draft-actions";
import {useAdminUnsavedChanges} from "@/components/admin/unsaved-changes-guard";
import {SupportDraftPanel,type SupportAssistance} from "./support-draft-panel";
import {newAttemptId} from "@/lib/random-id";

/** Manual send remains an explicit action. Browser persistence contains only
 * a session-bound encrypted envelope; the server rechecks every delivery gate. */
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
  alreadySent: string;
  draftRestored: string;
  errors: Readonly<Record<InboxReplyErrorCode, string>>;
}>;

export type InboxComposerTemplate = Readonly<{key: string; label: string}>;

type Kind = "session" | "template";

/** `restored` is a fact about `content`, so the two live together. */
type Draft = Readonly<{content: string; restored: boolean}>;

const EMPTY_DRAFT: Draft = {content: "", restored: false};

const initialState: InboxReplyState = {status: "idle"};

export type InboxDraftProtection=Readonly<{scope:string;enabled:boolean;protect:typeof protectInboxDraftAction;restore:typeof restoreInboxDraftAction}>;
function protectedKey(conversationId:string,scope:string){return `wtia:inbox-protected:${scope}:${conversationId}`;}
function attemptKey(conversationId:string):string{return `wtia:inbox-attempt:${conversationId}`;}
/**
 * Reads this thread's attempt token, minting and storing one on first use.
 *
 * Guarded like every other storage access here: a private window THROWS rather
 * than returning null. With storage blocked the token still exists — it just
 * lives for the life of this mount, which degrades the reload case exactly as
 * far as the draft itself is degraded, and no further.
 */
function readAttemptId(conversationId: string): string {
  try {
    const stored = window.sessionStorage.getItem(attemptKey(conversationId));
    if (stored) return stored;
  } catch {
    return newAttemptId();
  }
  const minted = newAttemptId();
  try {
    window.sessionStorage.setItem(attemptKey(conversationId), minted);
  } catch {
    // Same degradation as the draft: per-mount rather than per-tab.
  }
  return minted;
}

/** A fresh attempt, stored so the next reload agrees with this tab. */
function rotateAttemptId(conversationId: string): string {
  const minted = newAttemptId();
  try {
    window.sessionStorage.setItem(attemptKey(conversationId), minted);
  } catch {
    // Nothing to do; the value in state is still the one the form submits.
  }
  return minted;
}

export function InboxComposer({
  action,
  conversationId,
  labels,
  templates,
  windowMessage,
  windowState,
  draftProtection,
  assistance,
}: Readonly<{
  action: (state: InboxReplyState, formData: FormData) => Promise<InboxReplyState>;
  conversationId: string;
  labels: InboxComposerLabels;
  templates: readonly InboxComposerTemplate[];
  /** Already formatted on the server, from the same constant the adapter enforces. */
  windowMessage: string;
  windowState: "open" | "closed" | "never";
  draftProtection?:InboxDraftProtection;
  assistance?:SupportAssistance;
}>) {
  const scope=draftProtection?.scope??"volatile",identity=scope+":"+conversationId;
  const encryptedKey=protectedKey(conversationId,scope);
  const protectionEnabled=draftProtection?.enabled??false,protect=draftProtection?.protect,restoreProtected=draftProtection?.restore;
  const sequence=useRef(0),[loaded,setLoaded]=useState(false);
  const {setDirty}=useAdminUnsavedChanges();
  const [kind, setKind] = useState<Kind>("session");
  const [templateKey, setTemplateKey] = useState("");
  // One piece of state, not two: the notice is a fact about the CONTENT — this
  // text came back from storage rather than from the keyboard — so the two can
  // never be updated apart, and every writer below is a single `setDraft`.
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  // Empty until the mount effect below reads storage, for the same reason the
  // draft is: minting during render would produce different markup on the
  // server and the client. The submit button is disabled until it is populated,
  // so no submit can reach the server without one — which the server requires.
  const [attemptId, setAttemptId] = useState("");

  // The draft is cleared HERE, in the submit, rather than in an effect watching
  // for `status === "sent"`: a sent reply is no longer a draft, and tying the
  // clear to the event that makes it true keeps the two from getting out of step
  // (an effect would also have to re-run for two identical sends in a row).
  const [state, formAction, pending] = useActionState(
    async (previous: InboxReplyState, formData: FormData): Promise<InboxReplyState> => {
      const result = await action(previous, formData);
      // `sent` ONLY. C-2: `already_sent` means the adapter was never called and
      // the member received nothing from this attempt, so the draft is the last
      // copy of the text and clearing it would destroy the evidence; and the
      // token must NOT rotate, or the next click would mint a new row and send
      // a reply whose acceptance we could not confirm. The same holds for a
      // failure — DELIVERY_FAILED's retry is a re-take of the row this attempt
      // already wrote, which only the unchanged token can find.
      if (result.status === "sent") {
        sequence.current++;
        try{window.sessionStorage.removeItem(encryptedKey);}catch{/* In-memory typing remains available. */}
        setDraft(EMPTY_DRAFT);
        setAttemptId(rotateAttemptId(identity));
      }
      return result;
    },
    initialState,
  );

  useEffect(()=>{
    let active=true;
    purgeLegacyInboxPlaintext();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore this mounted session's opaque draft after browser storage becomes available.
    setAttemptId(readAttemptId(identity));
    const restoreVersion=sequence.current;
    async function restore(){
      try{
        const saved=protectionEnabled?window.sessionStorage.getItem(encryptedKey):null;
        if(saved&&restoreProtected){
          const result=await restoreProtected(conversationId,saved);
          if(active&&sequence.current===restoreVersion&&result.status==="restored"){
            setDraft({content:result.draft.content,restored:true});setAttemptId(result.draft.attemptId);
          }else if(active&&result.status==="missing")window.sessionStorage.removeItem(encryptedKey);
        }
      }catch{/* A denied storage/network read does not disable manual work. */}
      finally{if(active)setLoaded(true);}
    }
    void restore();
    const clear=()=>{sequence.current++;setDraft(EMPTY_DRAFT);setAttemptId(newAttemptId());};
    window.addEventListener("hkwtia:inbox-drafts-cleared",clear);
    return()=>{active=false;sequence.current++;window.removeEventListener("hkwtia:inbox-drafts-cleared",clear);};
  },[identity,conversationId,encryptedKey,protectionEnabled,restoreProtected]);
  useEffect(()=>{setDirty(Boolean(draft.content));return()=>setDirty(false);},[draft.content,setDirty]);
  useEffect(()=>{
    if(!loaded)return;
    if(!draft.content){sequence.current++;try{window.sessionStorage.removeItem(encryptedKey);}catch{/* Storage is optional. */}return;}
    if(!protectionEnabled||!protect||!attemptId)return;
    const version=++sequence.current,epoch=inboxDraftStorageGeneration();
    const timeout=window.setTimeout(async()=>{
      let result:Awaited<ReturnType<typeof protect>>;
      try{result=await protect(conversationId,{content:draft.content,attemptId});}catch{return;}
      if(result.status!=="protected"||version!==sequence.current||epoch!==inboxDraftStorageGeneration())return;
      try{window.sessionStorage.setItem(encryptedKey,result.envelope);}catch{/* Keep the visible draft. */}
    },350);
    return()=>window.clearTimeout(timeout);
  },[loaded,protectionEnabled,protect,draft.content,attemptId,conversationId,encryptedKey]);

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
    <div className="space-y-4">
    {assistance?<SupportDraftPanel conversationId={conversationId} value={assistance} dirty={Boolean(draft.content)} onAdopt={content=>{sequence.current++;setDraft({content,restored:false});}}/>:null}
    {assistance?<p className="text-sm text-muted-foreground">{draftProtection?.enabled?assistance.labels.draftProtected:assistance.labels.draftVolatile}</p>:null}
    <form action={formAction} className="space-y-4 rounded-md border border-border p-4">
      <input name="conversationId" type="hidden" value={conversationId} />
      {/* The per-attempt token. Hidden rather than derived on the server,
          because the server cannot tell a double-click from a deliberate
          re-send days later and this is the only place that can. */}
      <input name="attemptId" type="hidden" value={attemptId} />
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
              sequence.current++;
            }}
            placeholder={labels.placeholder}
            required
            value={draft.content}
          />
        </label>
      </fieldset>
      <button
        className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        disabled={pending || attemptId === "" || (kind === "session" && windowBlocksSession)}
        type="submit"
      >
        {pending ? labels.sending : labels.send}
      </button>
      {/* `already_sent` is styled as a warning, not as a success: nothing was
          sent, and the one person who could act on that is reading this line. */}
      <p
        aria-live="polite"
        className={state.status === "error" || state.status === "already_sent"
          ? "text-sm text-destructive"
          : "text-sm text-muted-foreground"}
        role="status"
      >
        {state.status === "error" && state.code !== undefined
          ? labels.errors[state.code]
          : state.status === "already_sent"
            ? labels.alreadySent
            : state.status === "sent"
              ? labels.sent
              : draft.restored ? labels.draftRestored : ""}
      </p>
    </form>
    </div>
  );
}

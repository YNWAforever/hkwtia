"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {ExternalLink, Send, Star, X} from "lucide-react";
import {usePathname} from "next/navigation";
import {type FormEvent, useEffect, useId, useRef, useState} from "react";

import {Button} from "@/components/ui/button";
import {Arrow} from "@/components/wt/arrow";
import type {ConciergeLabels} from "@/lib/ai/concierge-labels";
import {CONCIERGE_OPEN_EVENT} from "@/lib/ai/concierge-open";
import {type ConciergePrompts, resolveConciergePromptSection} from "@/lib/ai/concierge-prompts";
import {localizedPath} from "@/lib/urls";
import {cn} from "@/lib/utils";

export type {ConciergeLabels} from "@/lib/ai/concierge-labels";

type Citation = Readonly<{
  sourceId: string;
  title: string;
  url?: string;
}>;

type TranscriptMessage = Readonly<{
  id: string;
  role: "user" | "assistant";
  text: string;
  runId?: string;
  citations?: readonly Citation[];
  escalationId?: string | null;
}>;

type ErrorState = Readonly<{message: string; retryMessage?: string}>;
type DisabledState = Readonly<{taskId: string}>;
type Props = Readonly<{
  locale: "en" | "zh-HK";
  labels: ConciergeLabels;
  /** Absent when Turnstile is not configured; the challenge is then skipped. */
  turnstileSiteKey?: string;
  /**
   * Optional so the label contract (`ConciergeLabels`) stays a closed 31-key tuple and the
   * widget's own suite keeps compiling. Absent means no prompt list and no transparency link.
   */
  prompts?: ConciergePrompts;
  transparencyLabel?: string;
}>;

const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = Readonly<{
  render: (
    container: HTMLElement,
    options: Readonly<{
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      theme?: "auto";
      language?: string;
    }>,
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
}>;

declare global {
  var turnstile: TurnstileApi | undefined;
}

// Memoized so reopening the panel reuses the one tag this module created.
// Attaching a load listener to a pre-existing tag would never fire if that tag
// had already finished loading, leaving the caller waiting forever.
let turnstileScript: Promise<void> | undefined;

function loadTurnstileScript(): Promise<void> {
  if (globalThis.turnstile) return Promise.resolve();
  turnstileScript ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), {once: true});
    script.addEventListener(
      "error",
      () => reject(new Error("TURNSTILE_SCRIPT_FAILED")),
      {once: true},
    );
    document.head.append(script);
  });
  return turnstileScript;
}

function interpolate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) =>
      result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

const CONTACT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validContactEmail(value: string): boolean {
  const normalized = value.trim();
  return normalized === ""
    || (normalized.length <= 320 && CONTACT_EMAIL_PATTERN.test(normalized));
}

function safeCitationUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function citations(value: unknown): readonly Citation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const input = record(item);
    if (
      typeof input.sourceId !== "string"
      || typeof input.title !== "string"
    ) {
      return [];
    }
    return [{
      sourceId: input.sourceId,
      title: input.title,
      ...(typeof input.url === "string" ? {url: input.url} : {}),
    }];
  });
}

function parseFrame(frame: string) {
  let event = "";
  const data: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (!event || data.length === 0) return null;
  try {
    return {event, data: JSON.parse(data.join("\n")) as unknown};
  } catch {
    return {event: "error", data: {code: "INVALID_STREAM"}};
  }
}

async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: Readonly<{event: string; data: unknown}>) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const result = await reader.read();
      buffer += decoder.decode(result.value, {stream: !result.done});
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const parsed = parseFrame(frame);
        if (parsed) onEvent(parsed);
      }
      if (result.done) break;
    }
    if (buffer.trim()) {
      const parsed = parseFrame(buffer);
      if (parsed) onEvent(parsed);
    }
  } catch (error) {
    try {
      await reader.cancel(error);
    } catch {
      // Preserve the original stream/dispatch failure.
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function ConciergeWidget({
  locale,
  labels,
  turnstileSiteKey,
  prompts,
  transparencyLabel,
}: Props) {
  const dialogId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = useRef<string | undefined>(undefined);
  const contactEmailRef = useRef<HTMLInputElement>(null);
  const externalInvokerRef = useRef<HTMLElement | null>(null);
  const terminalEscalationRef = useRef(false);
  const mountedRef = useRef(true);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const activeControllerRef = useRef<AbortController | undefined>(undefined);
  const requestActiveRef = useRef(false);
  const feedbackPendingRef = useRef(new Set<string>());
  const sequenceRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactEmailInvalid, setContactEmailInvalid] = useState(false);
  const [terminalEscalated, setTerminalEscalated] = useState(false);
  const [messages, setMessages] = useState<readonly TranscriptMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [error, setError] = useState<ErrorState | null>(null);
  const [disabledState, setDisabledState] = useState<DisabledState | null>(null);
  const [feedbackState, setFeedbackState] = useState<
    Record<string, "pending" | "recorded" | "error">
  >({});
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileFailed, setTurnstileFailed] = useState(false);
  // The donor keys its prompt set on path[0]. Read during render, never resolved once into
  // state: this widget is mounted by app/[locale]/(public)/layout.tsx, which survives every
  // in-app navigation, so a value captured at mount would still serve the first route's
  // prompts after the reader had clicked through the header, the mega menu and the footer.
  // `next/navigation` rather than next-intl's hook, for two reasons: the latter needs locale
  // context that tests/unit/concierge-widget.test.tsx does not provide, and it strips the `/zh`
  // prefix that resolveConciergePromptSection expects to strip itself. Next's hook is
  // useContext(PathnameContext) with a null default, so a bare render outside the App Router
  // gets null rather than throwing. Presentation only — nothing here reaches the action.
  const pathname = usePathname();
  const sectionPrompts = prompts?.[resolveConciergePromptSection(pathname ?? "/")] ?? [];

  useEffect(() => {
    mountedRef.current = true;
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      mountedRef.current = false;
      activeControllerRef.current?.abort();
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    const handleOpen = () => {
      const activeElement = document.activeElement;
      externalInvokerRef.current =
        activeElement instanceof HTMLElement
          && activeElement !== document.body
          && activeElement !== document.documentElement
          ? activeElement
          : null;
      setOpen(true);
    };
    window.addEventListener(CONCIERGE_OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(CONCIERGE_OPEN_EVENT, handleOpen);
  }, []);

  // Rendered only while the panel is open, so the challenge is not requested
  // for visitors who never open the concierge.
  useEffect(() => {
    if (!turnstileSiteKey || !open) return;
    let widgetId: string | undefined;
    let cancelled = false;

    void loadTurnstileScript()
      .then(() => {
        const api = globalThis.turnstile;
        const container = turnstileRef.current;
        if (cancelled || !container) return;
        // A blocked or rewritten script can load without defining the global.
        // Surface that instead of leaving the composer silently unsendable.
        if (!api) {
          setTurnstileFailed(true);
          return;
        }
        widgetId = api.render(container, {
          sitekey: turnstileSiteKey,
          callback: (token) => setTurnstileToken(token),
          "expired-callback": () => setTurnstileToken(null),
          "error-callback": () => {
            setTurnstileToken(null);
            setTurnstileFailed(true);
          },
          theme: "auto",
          language: locale === "zh-HK" ? "zh-tw" : "en",
        });
        turnstileWidgetIdRef.current = widgetId;
      })
      .catch(() => {
        if (!cancelled) setTurnstileFailed(true);
      });

    return () => {
      cancelled = true;
      setTurnstileToken(null);
      turnstileWidgetIdRef.current = undefined;
      if (widgetId) globalThis.turnstile?.remove(widgetId);
    };
  }, [turnstileSiteKey, open, locale]);

  function updateAssistant(
    id: string,
    update: (message: TranscriptMessage) => TranscriptMessage,
  ) {
    if (!mountedRef.current) return;
    setMessages((current) =>
      current.map((message) => message.id === id ? update(message) : message),
    );
  }

  async function sendTurn(
    message: string,
    options: Readonly<{retry?: boolean}> = {},
  ) {
    const normalized = message.trim();
    if (
      !normalized
      || normalized.length > 2000
      || requestActiveRef.current
      || disabledState
      || terminalEscalationRef.current
    ) {
      return;
    }
    if (!validContactEmail(contactEmail)) {
      setContactEmailInvalid(true);
      contactEmailRef.current?.focus();
      return;
    }
    if (!navigator.onLine) {
      setOnline(false);
      setError({message: labels.offline, retryMessage: normalized});
      return;
    }
    if (turnstileSiteKey && !turnstileToken) {
      setError({
        message: turnstileFailed
          ? labels.verificationError
          : labels.verificationPending,
        retryMessage: normalized,
      });
      return;
    }

    requestActiveRef.current = true;
    const controller = new AbortController();
    activeControllerRef.current = controller;
    const sequence = ++sequenceRef.current;
    const assistantId = `concierge-assistant-${sequence}`;
    let runId: string | undefined;
    let errorEscalationId: string | undefined;
    let terminal = false;

    setSending(true);
    setError(null);
    setMessages((current) => [
      ...current,
      ...(!options.retry
        ? [{
          id: `concierge-user-${sequence}`,
          role: "user" as const,
          text: normalized,
        }]
        : []),
      {id: assistantId, role: "assistant", text: ""},
    ]);
    if (!options.retry) setDraft("");

    try {
      const response = await fetch("/api/ai/concierge", {
        method: "POST",
        headers: {"content-type": "application/json"},
        credentials: "same-origin",
        body: JSON.stringify({
          ...(conversationIdRef.current
            ? {conversationId: conversationIdRef.current}
            : {}),
          ...(!conversationIdRef.current && contactEmail.trim()
            ? {contactEmail: contactEmail.trim()}
            : {}),
          ...(turnstileToken ? {turnstileToken} : {}),
          message: normalized,
          locale,
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error("REQUEST_FAILED");

      await readSse(response.body, ({event, data}) => {
        if (!mountedRef.current || controller.signal.aborted) return;
        const input = record(data);
        if (event === "meta") {
          if (typeof input.conversationId === "string") {
            conversationIdRef.current = input.conversationId;
          }
          if (typeof input.runId === "string") runId = input.runId;
        } else if (event === "delta" && typeof input.text === "string") {
          updateAssistant(assistantId, (assistant) => ({
            ...assistant,
            text: assistant.text + input.text,
          }));
        } else if (event === "done") {
          terminal = true;
          updateAssistant(assistantId, (assistant) => ({
            ...assistant,
            ...(runId ? {runId} : {}),
            citations: citations(input.citations),
            escalationId: typeof input.escalationId === "string"
              ? input.escalationId
              : null,
          }));
        } else if (
          event === "disabled"
          && typeof input.taskId === "string"
        ) {
          terminal = true;
          setDisabledState({taskId: input.taskId});
          setMessages((current) =>
            current.filter((item) => item.id !== assistantId),
          );
        } else if (event === "error") {
          terminal = true;
          if (typeof input.escalationId === "string") {
            errorEscalationId = input.escalationId;
            terminalEscalationRef.current = true;
            setTerminalEscalated(true);
            updateAssistant(assistantId, (assistant) => ({
              ...assistant,
              escalationId: input.escalationId as string,
            }));
          }
          throw new Error("STREAM_ERROR");
        }
      });
      if (!terminal) throw new Error("INCOMPLETE_STREAM");
    } catch (caught) {
      if (
        controller.signal.aborted
        || (caught instanceof DOMException && caught.name === "AbortError")
      ) {
        if (mountedRef.current) {
          setMessages((current) =>
            current.filter((item) => item.id !== assistantId),
          );
        }
      } else if (mountedRef.current) {
        if (!errorEscalationId) {
          setMessages((current) =>
            current.filter((item) => item.id !== assistantId),
          );
        }
        setError({
          message: labels.error,
          ...(errorEscalationId ? {} : {retryMessage: normalized}),
        });
      }
    } finally {
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = undefined;
        requestActiveRef.current = false;
      }
      if (mountedRef.current) setSending(false);
      // Turnstile tokens are single-use, so the next turn needs a fresh one.
      if (turnstileWidgetIdRef.current) {
        setTurnstileToken(null);
        globalThis.turnstile?.reset(turnstileWidgetIdRef.current);
      }
    }
  }

  async function recordFeedback(runId: string, score: number) {
    if (
      score < 1
      || score > 5
      || feedbackPendingRef.current.has(runId)
      || feedbackState[runId] === "recorded"
    ) {
      return;
    }
    feedbackPendingRef.current.add(runId);
    setFeedbackState((current) => ({...current, [runId]: "pending"}));
    try {
      const response = await fetch(
        `/api/ai/conversations/${runId}/feedback`,
        {
          method: "POST",
          headers: {"content-type": "application/json"},
          credentials: "same-origin",
          body: JSON.stringify({score}),
        },
      );
      if (!response.ok) throw new Error("FEEDBACK_FAILED");
      if (mountedRef.current) {
        setFeedbackState((current) => ({...current, [runId]: "recorded"}));
      }
    } catch {
      if (mountedRef.current) {
        setFeedbackState((current) => ({...current, [runId]: "error"}));
      }
    } finally {
      feedbackPendingRef.current.delete(runId);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendTurn(draft);
  }

  const composerLocked = Boolean(disabledState) || terminalEscalated;

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) externalInvokerRef.current = null;
    setOpen(nextOpen);
  }

  function cancelRequest() {
    const controller = activeControllerRef.current;
    if (!controller) return;
    activeControllerRef.current = undefined;
    requestActiveRef.current = false;
    setSending(false);
    controller.abort();
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={labels.launcher}
          aria-controls={dialogId}
          aria-expanded={open}
          className="concierge-trigger fixed touch-manipulation bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] z-40 inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg motion-safe:transition-[opacity,transform] motion-safe:duration-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 active:opacity-90"
        >
          {/* Both class families on purpose: `.concierge-trigger` and its `span` rule style this
              inside the public route group, where the port is loaded, and the Tailwind
              utilities are the fallback in the portal, where it is not (errata E-11). They only
              back the port up, never override it: `hover:bg-primary/90` was dropped because at
              specificity (0,2,0) it beat `.concierge-trigger` (0,1,0) and repainted the donor
              ink on hover, and the port declares no `.concierge-trigger:hover` of its own — so
              the donor pill is deliberately static, with the cursor and the focus ring carrying
              the affordance. The label must stay a bare text node — `.concierge-trigger span`
              turns any span into the 38px badge. */}
          <span
            aria-hidden="true"
            className="inline-grid size-9 shrink-0 place-items-center rounded-full bg-white font-serif text-[15px] font-bold text-primary"
          >
            W+
          </span>
          {labels.launcher}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/50 motion-safe:data-[state=closed]:opacity-0 motion-safe:transition-opacity motion-safe:duration-200" />
        <Dialog.Content
          id={dialogId}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            textareaRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            const externalInvoker = externalInvokerRef.current;
            if (!externalInvoker?.isConnected) return;
            event.preventDefault();
            externalInvokerRef.current = null;
            externalInvoker.focus();
          }}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[calc(100vw-2rem-env(safe-area-inset-left)-env(safe-area-inset-right))] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl motion-safe:data-[state=closed]:scale-95 motion-safe:data-[state=closed]:opacity-0 motion-safe:transition-[opacity,transform] motion-safe:duration-200"
        >
          <header className="relative border-b border-border px-5 py-4 pr-16">
            <Dialog.Title className="editorial-serif text-xl font-semibold">
              {labels.title}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm leading-6 text-muted-foreground">
              {labels.description}
            </Dialog.Description>
            <Dialog.Close
              aria-label={labels.close}
              className="absolute right-3 top-3 inline-flex touch-manipulation size-11 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
            >
              <X aria-hidden="true" className="size-5" />
            </Dialog.Close>
          </header>

          <div className="flex min-h-0 flex-1 flex-col">
            <ol
              aria-label={labels.title}
              aria-live="polite"
              className="min-h-40 flex-1 space-y-4 overflow-y-auto overscroll-contain overflow-x-hidden px-4 py-4"
            >
              {/* Openers only while the transcript is empty. The donor keeps `.prompt-list`
                  beside the answer (commit f91ecc5 :1050); hkwtia drops it once a real
                  conversation exists, because re-offering "How can WiseTech help my
                  organisation?" underneath the reader's own third question reads as the
                  assistant having lost the thread. */}
              {messages.length === 0 && !disabledState ? (
                <li className="text-sm leading-6 text-muted-foreground">
                  {labels.empty}
                  {sectionPrompts.length > 0 ? (
                    <div className="mt-3 grid gap-2">
                      {sectionPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          className="flex min-h-11 touch-manipulation items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-sm text-foreground hover:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                          onClick={() => {
                            // Fills the composer instead of sending: `submit` is the only path
                            // that runs the contact-email and Turnstile gates, and WP-2 changes
                            // no runtime behaviour (errata E-23).
                            setDraft(prompt);
                            textareaRef.current?.focus();
                          }}
                        >
                          {prompt}
                          <Arrow />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </li>
              ) : null}
              {messages.map((message) => (
                <li
                  key={message.id}
                  className={cn(
                    "min-w-0 rounded-lg border px-4 py-3 text-sm leading-6",
                    message.role === "user"
                      ? "ml-8 border-primary/25 bg-primary/10"
                      : "mr-8 border-secondary/30 bg-secondary/10",
                  )}
                >
                  <p className="mb-1 text-xs font-semibold">
                    {message.role === "user" ? labels.you : labels.assistant}
                  </p>
                  <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {message.text}
                  </p>
                  {message.escalationId ? (
                    <div className="mt-3 rounded-md border border-secondary/40 bg-background p-3">
                      <p>{labels.escalated}</p>
                      <p className="mt-1 font-medium">
                        {interpolate(labels.reference, {
                          id: message.escalationId,
                        })}
                      </p>
                    </div>
                  ) : null}
                  {message.citations?.length ? (
                    <div className="mt-3 border-t border-border pt-3">
                      <p className="text-xs font-semibold">{labels.sources}</p>
                      <ul className="mt-2 space-y-2">
                        {message.citations.map((citation) => {
                          const url = safeCitationUrl(citation.url);
                          return url ? (
                            <li key={citation.sourceId}>
                              <a
                                className="inline-flex min-h-11 max-w-full touch-manipulation items-center gap-2 rounded-md text-primary underline hover:text-primary/80 decoration-primary/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                                href={url.href}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <span className="[overflow-wrap:anywhere]">
                                  {citation.title} · {url.host}
                                </span>
                                <ExternalLink
                                  aria-hidden="true"
                                  className="size-4 shrink-0"
                                />
                              </a>
                            </li>
                          ) : null;
                        })}
                      </ul>
                    </div>
                  ) : null}
                  {message.role === "assistant"
                    && (message.text || message.escalationId)
                    && message.runId ? (
                      <div className="mt-3 border-t border-border pt-3">
                        {feedbackState[message.runId] === "recorded" ? (
                          <p className="text-sm font-medium text-secondary">
                            {labels.feedbackThanks}
                          </p>
                        ) : (
                          <>
                            <p className="text-xs font-semibold">
                              {labels.feedbackPrompt}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {[1, 2, 3, 4, 5].map((score) => (
                                <button
                                  key={score}
                                  type="button"
                                  aria-label={interpolate(
                                    labels.feedbackLabel,
                                    {score},
                                  )}
                                  disabled={
                                    feedbackState[message.runId!] === "pending"
                                  }
                                  onClick={() =>
                                    void recordFeedback(message.runId!, score)}
                                  className="inline-flex size-11 touch-manipulation cursor-pointer items-center justify-center rounded-md border border-border bg-background text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Star aria-hidden="true" className="size-5" />
                                </button>
                              ))}
                            </div>
                            {feedbackState[message.runId] === "error" ? (
                              <p role="alert" className="mt-2 text-sm text-destructive">
                                {labels.feedbackError}
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : null}
                </li>
              ))}
              {disabledState ? (
                <li className="rounded-lg border border-secondary/40 bg-secondary/10 p-4 text-sm leading-6">
                  <p className="font-semibold">{labels.disabled}</p>
                  <p className="mt-1">{labels.leaveMessage}</p>
                  <p className="mt-2 font-medium">
                    {interpolate(labels.reference, {
                      id: disabledState.taskId,
                    })}
                  </p>
                </li>
              ) : null}
            </ol>

            {transparencyLabel === undefined ? null : (
              <p className="px-4 pb-2 text-xs leading-5 text-muted-foreground">
                <a
                  className="inline-flex min-h-11 touch-manipulation items-center gap-1 underline decoration-muted-foreground/50 underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                  href={localizedPath(locale, "/ai-transparency")}
                >
                  {transparencyLabel}
                  <Arrow />
                </a>
              </p>
            )}

            <div aria-live="assertive" className="px-4">
              {error ? (
                <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                  <p role="alert" className="text-sm text-destructive">
                    {error.message}
                  </p>
                  {error.retryMessage ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 min-h-11 touch-manipulation"
                      disabled={sending || !online}
                      onClick={() =>
                        void sendTurn(error.retryMessage!, {retry: true})}
                    >
                      {labels.retry}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <form
              noValidate
              onSubmit={submit}
              className="border-t border-border p-4"
            >
              <div>
                <label
                  htmlFor={`${dialogId}-contact-email`}
                  className="text-sm font-semibold"
                >
                  {labels.contactEmailLabel}
                </label>
                <input
                  ref={contactEmailRef}
                  id={`${dialogId}-contact-email`}
                  name="contactEmail"
                  type="email"
                  autoComplete="email"
                  spellCheck={false}
                  maxLength={320}
                  value={contactEmail}
                  disabled={composerLocked}
                  aria-invalid={contactEmailInvalid}
                  aria-describedby={`${dialogId}-contact-email-help`}
                  onChange={(event) => {
                    const value = event.target.value;
                    setContactEmail(value);
                    if (contactEmailInvalid) {
                      setContactEmailInvalid(!validContactEmail(value));
                    }
                  }}
                  onBlur={(event) =>
                    setContactEmailInvalid(
                      !validContactEmail(event.currentTarget.value),
                    )}
                  className="mt-2 block min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60"
                />
                <p
                  id={`${dialogId}-contact-email-help`}
                  className="mt-1 text-xs leading-5 text-muted-foreground"
                >
                  {labels.contactEmailHelper}
                </p>
                {contactEmailInvalid ? (
                  <p role="alert" className="mt-1 text-sm text-destructive">
                    {labels.contactEmailError}
                  </p>
                ) : null}
              </div>
              <label
                htmlFor={`${dialogId}-message`}
                className="mt-4 block text-sm font-semibold"
              >
                {labels.messageLabel}
              </label>
              <textarea
                ref={textareaRef}
                id={`${dialogId}-message`}
                name="message"
                autoComplete="off"
                value={draft}
                maxLength={2000}
                rows={3}
                disabled={composerLocked}
                placeholder={labels.placeholder}
                onChange={(event) => setDraft(event.target.value.slice(0, 2000))}
                className="mt-2 block min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-3 text-base leading-6 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60"
              />
              {turnstileSiteKey ? (
                <div className="mt-4">
                  <p className="text-sm font-semibold">
                    {labels.verificationLabel}
                  </p>
                  <div className="mt-2" ref={turnstileRef} />
                  {turnstileFailed ? (
                    <p role="alert" className="mt-1 text-sm text-destructive">
                      {labels.verificationError}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-2 flex items-center justify-between gap-4">
                <p className="text-xs tabular-nums text-muted-foreground">
                  {interpolate(labels.characterCount, {count: draft.length})}
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                  {sending ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 touch-manipulation"
                      onClick={cancelRequest}
                    >
                      {labels.cancel}
                    </Button>
                  ) : null}
                  <Button
                    type="submit"
                    className="min-h-11 touch-manipulation"
                    disabled={
                      sending
                      || composerLocked
                      || draft.trim().length === 0
                    }
                  >
                    <Send aria-hidden="true" className="size-4" />
                    {sending ? labels.sending : labels.send}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

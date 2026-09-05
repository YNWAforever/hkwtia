import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import type {ReactElement} from "react";
import {afterEach, describe, expect, it, vi} from "vitest";

import {
  ConciergeWidget,
  type ConciergeLabels,
} from "@/components/ai/concierge-widget";
import {
  ContactConciergeLauncher,
} from "@/components/marketing/contact-concierge-launcher";
import {CONCIERGE_OPEN_EVENT} from "@/lib/ai/concierge-open";

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";

const labels: ConciergeLabels = {
  launcher: "Ask WTIA",
  title: "WTIA Concierge",
  description: "Ask about membership, events, programmes and support.",
  close: "Close Concierge",
  messageLabel: "Your message",
  contactEmailLabel: "Contact email (optional)",
  contactEmailHelper: "Used only if WTIA Concierge is unavailable so our team can follow up.",
  contactEmailError: "Enter a valid email address.",
  placeholder: "e.g. How do I join WTIA?…",
  send: "Send",
  sending: "Sending…",
  cancel: "Cancel response",
  empty: "Start a conversation with WTIA.",
  you: "You",
  assistant: "WTIA Concierge",
  sources: "Sources",
  retry: "Try again",
  error: "We couldn’t reach WTIA Concierge. Check your connection and try again.",
  offline: "You’re offline. Reconnect to send a message.",
  disabled: "AI support is currently paused.",
  leaveMessage: "Your message has been passed to the WTIA team.",
  escalated: "A WTIA team member will follow up.",
  reference: "Reference: {id}",
  feedbackPrompt: "How helpful was this answer?",
  feedbackLabel: "{score} out of 5",
  feedbackThanks: "Thank you for your feedback.",
  feedbackError: "We couldn’t save your feedback. Please try again.",
  characterCount: "{count} / 2000",
  verificationLabel: "Human verification",
  verificationPending: "Complete the verification check to send your message.",
  verificationError: "Verification is unavailable. Reload the page and try again.",
};

function widget(): ReactElement {
  return <ConciergeWidget locale="en" labels={labels} />;
}

function sseResponse(chunks: readonly (string | Uint8Array)[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  }), {
    status: 200,
    headers: {"content-type": "text/event-stream; charset=utf-8"},
  });
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return {promise, resolve};
}

async function openWidget() {
  const launcher = screen.getByRole("button", {name: labels.launcher});
  fireEvent.click(launcher);
  await screen.findByRole("dialog", {name: labels.title});
  return launcher;
}

function submit(message = "What events are coming up?") {
  fireEvent.change(screen.getByRole("textbox", {name: labels.messageLabel}), {
    target: {value: message},
  });
  fireEvent.click(screen.getByRole("button", {name: labels.send}));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ConciergeWidget", () => {
  it("falls back to the native trigger after a no-payload event from the document body", async () => {
    render(widget());
    const launcher = screen.getByRole("button", {name: labels.launcher});

    expect(document.body).toHaveFocus();
    act(() => window.dispatchEvent(new Event(CONCIERGE_OPEN_EVENT)));

    expect(await screen.findByRole("dialog", {name: labels.title})).toBeVisible();
    expect(screen.getByRole("textbox", {name: labels.messageLabel})).toHaveFocus();

    fireEvent.click(screen.getByRole("button", {name: labels.close}));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(launcher).toHaveFocus();
  });

  it("returns focus to the Contact launcher after Close and Escape", async () => {
    render(
      <>
        <ContactConciergeLauncher label="Ask WiseTech" />
        {widget()}
      </>,
    );
    const contactLauncher = screen.getByRole("button", {name: "Ask WiseTech"});

    expect(document.body).toHaveFocus();
    fireEvent.click(contactLauncher);
    expect(await screen.findByRole("dialog", {name: labels.title})).toBeVisible();
    expect(screen.getByRole("textbox", {name: labels.messageLabel})).toHaveFocus();

    fireEvent.click(screen.getByRole("button", {name: labels.close}));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(contactLauncher).toHaveFocus();

    fireEvent.click(contactLauncher);
    expect(await screen.findByRole("dialog", {name: labels.title})).toBeVisible();
    expect(screen.getByRole("textbox", {name: labels.messageLabel})).toHaveFocus();

    fireEvent.keyDown(document, {key: "Escape"});
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(contactLauncher).toHaveFocus();
  });

  it("labels its launcher and dialog, moves focus inside, closes with Escape, and returns focus", async () => {
    render(widget());
    const launcher = screen.getByRole("button", {name: labels.launcher});

    expect(launcher).toHaveAttribute("aria-expanded", "false");
    await openWidget();
    expect(launcher).toHaveAttribute("aria-expanded", "true");
    const textbox = screen.getByRole("textbox", {name: labels.messageLabel});
    expect(textbox).toHaveFocus();
    expect(textbox).toHaveAttribute("name", "message");
    expect(textbox).toHaveAttribute("autocomplete", "off");
    const email = screen.getByRole("textbox", {name: labels.contactEmailLabel});
    expect(email).toHaveAttribute("name", "contactEmail");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(email).toHaveAttribute("spellcheck", "false");
    expect(screen.getByText(labels.contactEmailHelper)).toBeVisible();

    const close = screen.getByRole("button", {name: labels.close});
    close.focus();
    fireEvent.keyDown(close, {key: "Tab", shiftKey: true});
    await waitFor(() => expect(textbox).toHaveFocus());
    expect(screen.getByRole("dialog", {name: labels.title}).querySelector("ol"))
      .toHaveClass("overscroll-contain");
    expect(close).toHaveClass("touch-manipulation");
    expect(launcher).toHaveClass("touch-manipulation");

    fireEvent.keyDown(document, {key: "Escape"});
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(launcher).toHaveFocus();
  });

  it("shows a 2000-character counter and prevents empty or over-limit submission", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(widget());
    await openWidget();

    const input = screen.getByRole("textbox", {name: labels.messageLabel});
    const send = screen.getByRole("button", {name: labels.send});
    expect(send).toBeDisabled();
    expect(screen.getByText("0 / 2000")).toBeVisible();

    fireEvent.change(input, {target: {value: "x".repeat(2001)}});
    expect(input).toHaveValue("x".repeat(2000));
    expect(screen.getByText("2000 / 2000")).toBeVisible();
  });

  it("validates the optional fallback email inline and focuses it on submit", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(widget());
    await openWidget();

    const email = screen.getByRole("textbox", {name: labels.contactEmailLabel});
    fireEvent.change(email, {target: {value: "not-an-email"}});
    fireEvent.blur(email);
    expect(screen.getByText(labels.contactEmailError)).toBeVisible();

    fireEvent.change(screen.getByRole("textbox", {name: labels.messageLabel}), {
      target: {value: "Please contact me"},
    });
    fireEvent.submit(email.closest("form")!);
    expect(email).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits once, parses split SSE chunks, preserves continuity, and renders only safe text and citation URLs", async () => {
    const first = [
      'event: meta\ndata: {"conversationId":"11111111-1111-4111-8111-111111111111","runId":"22222222-',
      '2222-4222-8222-222222222222"}\n\nevent: delta\ndata: {"text":"<img src=x onerror=alert(1)>Hello "}\n\nevent: del',
      'ta\ndata: {"text":"WTIA"}\n\nevent: done\ndata: {"citations":[{"sourceId":"safe","title":"WTIA Membership","url":"https://www.hkwtia.org/membership"},{"sourceId":"hostile","title":"Bad source","url":"javascript:alert(1)"}],"escalationId":null}\n\n',
    ];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sseResponse(first))
      .mockResolvedValueOnce(sseResponse([
        `event: meta\ndata: {"conversationId":"${CONVERSATION_ID}","runId":"${RUN_ID}"}\n\n`,
        'event: delta\ndata: {"text":"Second answer"}\n\n',
        'event: done\ndata: {"citations":[],"escalationId":null}\n\n',
      ]));
    vi.stubGlobal("fetch", fetchMock);
    render(widget());
    await openWidget();

    fireEvent.change(
      screen.getByRole("textbox", {name: labels.contactEmailLabel}),
      {target: {value: "person@example.com"}},
    );
    submit();
    fireEvent.click(screen.getByRole("button", {name: labels.sending}));

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(firstBody).toMatchObject({contactEmail: "person@example.com"});
    expect(screen.queryByText("person@example.com")).not.toBeInTheDocument();

    expect(await screen.findByText("<img src=x onerror=alert(1)>Hello WTIA")).toBeVisible();
    expect(document.querySelector("img")).toBeNull();
    const citation = screen.getByRole("link", {
      name: /WTIA Membership.*hkwtia\.org/,
    });
    expect(citation).toHaveAttribute("href", "https://www.hkwtia.org/membership");
    expect(citation).toHaveAttribute("rel", "noopener noreferrer");
    expect(citation).toHaveClass("hover:text-primary/80", "touch-manipulation");
    expect(screen.queryByRole("link", {name: /Bad source/})).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    submit("And member events?");
    await screen.findByText("Second answer");
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(secondBody).toMatchObject({
      conversationId: CONVERSATION_ID,
      locale: "en",
      message: "And member events?",
    });
    expect(secondBody).not.toHaveProperty("contactEmail");
  });

  it("parses CRLF frames, multiline data, and split multibyte UTF-8", async () => {
    const encoder = new TextEncoder();
    const beforeMultibyte = [
      `event: meta\r\ndata: {"conversationId":"${CONVERSATION_ID}","runId":"${RUN_ID}"}\r\n\r\n`,
      'event: delta\r\ndata: {"text":\r\ndata: "',
    ].join("");
    const stream = encoder.encode(
      `${beforeMultibyte}香港"}\r\n\r\nevent: done\r\ndata: {"citations":[],"escalationId":null}\r\n\r\n`,
    );
    const splitInsideCharacter = encoder.encode(beforeMultibyte).length + 1;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse([
      stream.slice(0, splitInsideCharacter),
      stream.slice(splitInsideCharacter),
    ])));
    render(widget());
    await openWidget();

    submit("Protocol edge cases");
    expect(await screen.findByText("香港")).toBeVisible();
  });

  it("cancels a held-open SSE reader when event dispatch fails", async () => {
    const encoder = new TextEncoder();
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(encoder.encode(
          'event: error\ndata: {"code":"AI_TEMPORARILY_UNAVAILABLE"}\n\n',
        ));
      },
      cancel,
    }), {
      status: 200,
      headers: {"content-type": "text/event-stream; charset=utf-8"},
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    render(widget());
    await openWidget();

    submit("Hold the stream");
    expect(await screen.findByRole("alert")).toHaveTextContent(labels.error);
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    expect(() => streamController.enqueue(encoder.encode("late"))).toThrow();
  });

  it("does not retry a terminal error carrying an escalation reference", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      'event: error\ndata: {"code":"AI_TEMPORARILY_UNAVAILABLE","escalationId":"WTIA-task-error"}\n\n',
    ]));
    vi.stubGlobal("fetch", fetchMock);
    render(widget());
    await openWidget();

    submit("Please help");
    expect(await screen.findByRole("alert")).toHaveTextContent(labels.error);
    expect(screen.getByText(labels.escalated)).toBeVisible();
    expect(screen.getByText("Reference: WTIA-task-error")).toBeVisible();
    expect(screen.queryByRole("button", {name: labels.retry}))
      .not.toBeInTheDocument();
    const composer = screen.getByRole("textbox", {name: labels.messageLabel});
    expect(composer).toBeDisabled();
    expect(screen.getByRole("button", {name: labels.send})).toBeDisabled();
    fireEvent.change(composer, {target: {value: "Submit again"}});
    fireEvent.submit(composer.closest("form")!);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a pre-tool stream error with the same turn only once", async () => {
    const retry = deferredResponse();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sseResponse([
        'event: error\ndata: {"code":"AI_TEMPORARILY_UNAVAILABLE"}\n\n',
      ]))
      .mockImplementationOnce(() => retry.promise);
    vi.stubGlobal("fetch", fetchMock);
    render(widget());
    await openWidget();

    submit("Please help");
    expect(await screen.findByRole("alert")).toHaveTextContent(labels.error);

    const retryButton = screen.getByRole("button", {name: labels.retry});
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    retry.resolve(sseResponse([
      `event: meta\ndata: {"conversationId":"${CONVERSATION_ID}","runId":"${RUN_ID}"}\n\n`,
      'event: delta\ndata: {"text":"Recovered"}\n\n',
      'event: done\ndata: {"citations":[],"escalationId":null}\n\n',
    ]));
    expect(await screen.findByText("Recovered")).toBeVisible();
  });

  it("reports offline status and recovers when the browser reconnects", async () => {
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    render(widget());
    await openWidget();

    submit("Hello");
    expect(await screen.findByRole("alert")).toHaveTextContent(labels.offline);
    expect(fetch).not.toHaveBeenCalled();

    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    fireEvent(window, new Event("online"));
    await waitFor(() =>
      expect(screen.getByRole("button", {name: labels.retry})).toBeEnabled(),
    );
  });

  it("aborts an active request on cancel and unmount without late UI updates", async () => {
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(widget());
    await openWidget();

    submit("Cancel this");
    fireEvent.click(await screen.findByRole("button", {name: labels.cancel}));
    expect(requestSignal?.aborted).toBe(true);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await screen.findByRole("button", {name: labels.send});
    submit("Unmount this");
    view.unmount();
    expect(requestSignal?.aborted).toBe(true);
  });

  it("shows disabled leave-message and escalation reference states and prevents another turn", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sseResponse([
        `event: meta\ndata: {"conversationId":"${CONVERSATION_ID}","runId":"${RUN_ID}"}\n\n`,
        'event: disabled\ndata: {"taskId":"task-disabled"}\n\n',
      ]))
      .mockResolvedValueOnce(sseResponse([
        `event: meta\ndata: {"conversationId":"${CONVERSATION_ID}","runId":"${RUN_ID}"}\n\n`,
        'event: delta\ndata: {"text":"I have asked the team."}\n\n',
        'event: done\ndata: {"citations":[],"escalationId":"WTIA-task-escalated"}\n\n',
      ]));
    vi.stubGlobal("fetch", fetchMock);
    const first = render(widget());
    await openWidget();

    submit("Leave this with the team");
    expect(await screen.findByText(labels.disabled)).toBeVisible();
    expect(screen.getByText(labels.leaveMessage)).toBeVisible();
    expect(screen.getByText("Reference: task-disabled")).toBeVisible();
    expect(screen.getByRole("textbox", {name: labels.messageLabel})).toBeDisabled();
    first.unmount();

    render(widget());
    await openWidget();
    submit("Escalate this");
    expect(await screen.findByText(labels.escalated)).toBeVisible();
    expect(screen.getByText("Reference: WTIA-task-escalated")).toBeVisible();
  });

  it("records one 1..5 feedback score per run, locks while pending, and recovers from an error", async () => {
    const feedback = deferredResponse();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sseResponse([
        `event: meta\ndata: {"conversationId":"${CONVERSATION_ID}","runId":"${RUN_ID}"}\n\n`,
        'event: delta\ndata: {"text":"Answer"}\n\n',
        'event: done\ndata: {"citations":[],"escalationId":null}\n\n',
      ]))
      .mockImplementationOnce(() => feedback.promise)
      .mockResolvedValueOnce(Response.json({status: "recorded"}));
    vi.stubGlobal("fetch", fetchMock);
    render(widget());
    await openWidget();
    submit("Question");
    await screen.findByText("Answer");

    const score = screen.getByRole("button", {name: "5 out of 5"});
    fireEvent.click(score);
    fireEvent.click(score);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    feedback.resolve(Response.json({error: "temporary"}, {status: 503}));
    expect(await screen.findByRole("alert")).toHaveTextContent(labels.feedbackError);

    fireEvent.click(screen.getByRole("button", {name: "5 out of 5"}));
    expect(await screen.findByText(labels.feedbackThanks)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `/api/ai/conversations/${RUN_ID}/feedback`,
    );
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      score: 5,
    });
    expect(screen.queryByRole("button", {name: "5 out of 5"}))
      .not.toBeInTheDocument();
  });

  it("wraps the launcher in the donor .concierge positioning wrapper", () => {
    render(widget());
    const launcher = screen.getByRole("button", {name: labels.launcher});
    const wrapper = launcher.closest(".concierge");
    expect(wrapper).not.toBeNull();
    expect(wrapper).not.toBe(launcher);
    expect(wrapper).toHaveClass(
      "concierge",
      "fixed",
      "bottom-[calc(1rem+env(safe-area-inset-bottom))]",
      "right-[calc(1rem+env(safe-area-inset-right))]",
      "z-40",
    );
    expect(launcher).toHaveClass("concierge-trigger", "touch-manipulation");
    expect(launcher).not.toHaveClass("fixed", "z-40");
    expect(launcher.className).not.toMatch(/bottom-\[calc\(1rem/);
    expect(launcher.className).not.toMatch(/right-\[calc\(1rem/);
  });
});

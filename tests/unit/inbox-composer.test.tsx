import {fireEvent, render, screen} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";

import {InboxComposer, type InboxComposerLabels} from "@/components/admin/inbox-composer";
import {INBOX_REPLY_ERROR_CODES, type InboxReplyErrorCode} from "@/lib/admin/inbox-action-core";
import en from "@/messages/en.json";

const conversationId = "11111111-1111-4111-8111-111111111111";
const draftKey = `wtia:inbox-draft:${conversationId}`;

const labels: InboxComposerLabels = {
  ...en.Admin.inbox.compose,
  errors: Object.fromEntries(
    INBOX_REPLY_ERROR_CODES.map((code) => [code, en.Admin.inbox.errors[code]]),
  ) as Record<InboxReplyErrorCode, string>,
};

const templates = [
  {key: "renewal_14", label: "wtia_renewal_d14"},
  {key: "concierge_follow_up_en", label: "wtia_concierge_follow_up_en"},
];

function composer(overrides: Partial<Parameters<typeof InboxComposer>[0]> = {}) {
  return render(
    <InboxComposer
      action={async () => ({status: "idle" as const})}
      conversationId={conversationId}
      labels={labels}
      templates={templates}
      windowMessage="3h 20m left to reply freely"
      windowState="open"
      {...overrides}
    />,
  );
}

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("InboxComposer", () => {
  it("submits no templateKey field for a free-text reply", () => {
    // Not cosmetic. `text(formData, "templateKey")` returns the empty STRING for
    // a rendered-but-unset `<select>`, and the reply schema's
    // `z.string().trim().min(1).nullable()` rejects "" — so a select left on the
    // page for a session reply turns every free-text reply into INVALID. Absent
    // is the only value that parses as "no template".
    const {container} = composer();
    expect(container.querySelector('select[name="templateKey"]')).toBeNull();
    expect(container.querySelector('input[name="conversationId"]')).toHaveValue(conversationId);
  });

  it("offers only the approved keys once the template lane is chosen", () => {
    const {container} = composer();
    fireEvent.click(screen.getByLabelText(labels.kindTemplate));
    const select = container.querySelector('select[name="templateKey"]');
    expect(select).not.toBeNull();
    const values = [...(select as HTMLSelectElement).options].map((option) => option.value);
    // The placeholder plus the two the page was given, and nothing the send gate
    // would refuse: the picker reads the same `approvedTemplateKeys()` set.
    expect(values).toEqual(["", "renewal_14", "concierge_follow_up_en"]);
  });

  it("collects a field for every ordered body parameter of the chosen template", () => {
    // `sendTemplateMessage` fills the body positionally from
    // `WHATSAPP_TEMPLATES[key].variables` and writes `""` for anything missing,
    // so an uncollected parameter is a blank in a message to a member.
    const {container} = composer();
    fireEvent.click(screen.getByLabelText(labels.kindTemplate));
    fireEvent.change(screen.getByLabelText(labels.template), {target: {value: "renewal_14"}});
    for (const variable of ["memberName", "renewalDate", "renewalUrl"]) {
      expect(container.querySelector(`input[name="variable.${variable}"]`), variable).not.toBeNull();
    }
  });

  it("disables a free-text send when the window is shut, and re-enables it for a template", () => {
    composer({windowState: "closed"});
    expect(screen.getByRole("button", {name: labels.send})).toBeDisabled();
    fireEvent.click(screen.getByLabelText(labels.kindTemplate));
    // A template is exactly what the closed window is for.
    expect(screen.getByRole("button", {name: labels.send})).toBeEnabled();
  });

  it("treats a thread nobody has written into as no window at all", () => {
    // Every pre-deploy anonymous thread is in this state until its next inbound
    // message. `never` is not `open`.
    composer({windowState: "never"});
    expect(screen.getByRole("button", {name: labels.send})).toBeDisabled();
  });

  it("restores a draft for this thread and says so", async () => {
    window.sessionStorage.setItem(draftKey, "Half a reply");
    composer();
    expect(await screen.findByDisplayValue("Half a reply")).toBeInTheDocument();
    expect(screen.getByText(labels.draftRestored)).toBeInTheDocument();
  });

  it("keeps each thread's draft to itself", () => {
    window.sessionStorage.setItem("wtia:inbox-draft:22222222-2222-4222-8222-222222222222", "Someone else's");
    const {container} = composer();
    expect(container.querySelector("textarea")).toHaveValue("");
  });

  it("saves what is typed, and clears it once the reply is sent", async () => {
    const {rerender} = composer();
    fireEvent.change(screen.getByLabelText(labels.message), {target: {value: "On my way"}});
    expect(window.sessionStorage.getItem(draftKey)).toBe("On my way");

    rerender(
      <InboxComposer
        action={async () => ({status: "sent" as const, messageId: "m1"})}
        conversationId={conversationId}
        labels={labels}
        templates={templates}
        windowMessage="3h 20m left to reply freely"
        windowState="open"
      />,
    );
    fireEvent.click(screen.getByRole("button", {name: labels.send}));
    expect(await screen.findByText(labels.sent)).toBeInTheDocument();
    expect(window.sessionStorage.getItem(draftKey)).toBeNull();
    expect(screen.getByLabelText(labels.message)).toHaveValue("");
  });

  it("still renders when site data is blocked", () => {
    // A private window does not return null from sessionStorage — it THROWS on
    // access. An unguarded read at mount would take the whole composer down, so
    // staff could not reply at all because a convenience could not remember a
    // draft.
    vi.spyOn(window.sessionStorage.__proto__, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(window.sessionStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    composer();
    fireEvent.change(screen.getByLabelText(labels.message), {target: {value: "Still typeable"}});
    expect(screen.getByLabelText(labels.message)).toHaveValue("Still typeable");
  });

  /**
   * C-2(b). `already_sent` means a row under this `outbound_key` had already
   * settled and the adapter was never called — the member got nothing from THIS
   * attempt. Reported as "Sent." it is a lost reply dressed as a success, and
   * the draft that was the only remaining copy of the text is cleared with it.
   */
  it("does not say Sent when the send was short-circuited, and keeps the draft", async () => {
    composer({action: async () => ({status: "already_sent" as const, messageId: "m1"})});
    fireEvent.change(screen.getByLabelText(labels.message), {target: {value: "Thanks!"}});
    fireEvent.click(screen.getByRole("button", {name: labels.send}));

    // An outcome the composer has no words for is an outcome staff never learn
    // about, which is how a dropped reply reads as a success.
    const status = await screen.findByRole("status");
    await vi.waitFor(() => expect(status).not.toBeEmptyDOMElement());
    expect(status).toHaveTextContent(labels.alreadySent);
    expect(status).not.toHaveTextContent(labels.sent);
    // The text staff typed is the evidence of what did NOT go out, so it stays.
    expect(screen.getByLabelText(labels.message)).toHaveValue("Thanks!");
    expect(window.sessionStorage.getItem(draftKey)).toBe("Thanks!");
  });

  /**
   * C-2(a). The per-attempt token is what bounds the `outbound_key` dedupe to
   * one send attempt instead of forever. It has to survive a reload — the retry
   * after a timeout has to find the same row — and it has to rotate once the
   * reply is sent, or the next identical sentence mints the same key again and
   * is silently dropped.
   */
  it("carries a per-attempt token that survives a reload and rotates once the reply is sent", async () => {
    const {container, unmount} = composer();
    const attempt = () => container.querySelector('input[name="attemptId"]') as HTMLInputElement | null;
    const first = attempt()?.value ?? "";
    expect(first).toMatch(/^[0-9a-f-]{36}$/);

    // A reload of the same unfinished attempt: same thread, same token.
    unmount();
    const reloaded = composer();
    const afterReload = reloaded.container.querySelector('input[name="attemptId"]') as HTMLInputElement | null;
    await vi.waitFor(() => expect(afterReload?.value).toBe(first));
    reloaded.unmount();

    const sent = composer({action: async () => ({status: "sent" as const, messageId: "m1"})});
    // The textarea is `required`, and jsdom runs constraint validation before it
    // will fire `submit` — an empty one silently never reaches the action.
    fireEvent.change(screen.getByLabelText(labels.message), {target: {value: "On my way"}});
    fireEvent.click(screen.getByRole("button", {name: labels.send}));
    expect(await screen.findByText(labels.sent)).toBeInTheDocument();
    const rotated = sent.container.querySelector('input[name="attemptId"]') as HTMLInputElement | null;
    expect(rotated?.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(rotated?.value).not.toBe(first);
  });

  it("renders a refused send through the translated error map", async () => {
    composer({action: async () => ({status: "error" as const, code: "WINDOW_CLOSED" as const})});
    fireEvent.change(screen.getByLabelText(labels.message), {target: {value: "Too late"}});
    fireEvent.click(screen.getByRole("button", {name: labels.send}));
    expect(await screen.findByText(en.Admin.inbox.errors.WINDOW_CLOSED)).toBeInTheDocument();
  });
});

import {describe, expect, it, vi} from "vitest";

import {
  buildLeadDigests,
  hktDate,
  runLeadReminders,
  type LeadReminderDependencies,
} from "@/lib/automation/lead-reminders";
import type {LeadReminderInputs} from "@/lib/db/repos/lead-reminders";
import {renderEmail} from "@/lib/email/render";
import {DeliveryFailure, type EmailSendInput} from "@/lib/email/transport";

/**
 * Phase E, Task 9. The daily digest. The clock is always passed in: "overdue"
 * is the due instant (18:00 HKT on the due day, 10:00Z) having passed, "due
 * today" is the due day being today in Hong Kong with the instant still ahead.
 */
process.env.NEXT_PUBLIC_SITE_URL = "https://wtia.example.test";

const sam = {profileId: "staff-sam", email: "sam@wtia.example.test", displayName: "Sam", locale: "en" as const};
const lee = {profileId: "staff-lee", email: "lee@wtia.example.test", displayName: "Lee", locale: "zh-HK" as const};

function lead(id: string, over: Partial<LeadReminderInputs["leads"][number]> = {}): LeadReminderInputs["leads"][number] {
  return {id, displayName: `Lead ${id}`, ownerProfileId: "staff-sam", nextStep: "Call back", nextStepDueAt: null, ...over};
}

function harness(inputs: Partial<LeadReminderInputs>, opts: {failFor?: string} = {}) {
  const sent: EmailSendInput[] = [];
  const full: LeadReminderInputs = {recipients: [sam], leads: [], staleInvites: [], ...inputs};
  const deps: LeadReminderDependencies = {
    repo: {load: vi.fn(async () => full)},
    transport: () => ({
      async send(input) {
        if (opts.failFor && input.to === opts.failFor) throw new DeliveryFailure("provider_client_error");
        sent.push(input);
        return {status: "sent", providerId: "p1"};
      },
    }),
    emailFrom: () => "WTIA <hello@wtia.example.test>",
    render: renderEmail,
  };
  return {deps, sent};
}

describe("hktDate", () => {
  it("reads the Hong Kong calendar day of an instant", () => {
    expect(hktDate(new Date("2026-10-19T23:59:00Z"))).toBe("2026-10-20");
    expect(hktDate(new Date("2026-10-19T15:59:00Z"))).toBe("2026-10-19");
  });
});

describe("lead reminder classification", () => {
  const due = new Date("2026-10-20T10:00:00.000Z"); // due day 2026-10-20, stored as 18:00 HKT

  it("treats a step due on the 20th as due today, not overdue, at 07:59 HKT on the 20th", () => {
    const [digest] = buildLeadDigests([sam], [lead("a", {nextStepDueAt: due})], [], new Date("2026-10-19T23:59:00Z"));
    expect(digest!.dueToday.map((item) => item.id)).toEqual(["a"]);
    expect(digest!.overdue).toEqual([]);
  });

  it("treats it as overdue at 00:00 HKT on the 21st", () => {
    const [digest] = buildLeadDigests([sam], [lead("a", {nextStepDueAt: due})], [], new Date("2026-10-20T16:00:00Z"));
    expect(digest!.overdue.map((item) => item.id)).toEqual(["a"]);
    expect(digest!.dueToday).toEqual([]);
  });

  it("is overdue once the 18:00 instant has passed on the same day, and ignores future days", () => {
    const evening = buildLeadDigests([sam], [lead("a", {nextStepDueAt: due})], [], new Date("2026-10-20T10:00:01Z"))[0]!;
    expect(evening.overdue.map((item) => item.id)).toEqual(["a"]);
    const early = buildLeadDigests([sam], [lead("a", {nextStepDueAt: due})], [], new Date("2026-10-18T10:00:00Z"))[0]!;
    expect([early.overdue, early.dueToday, early.stale]).toEqual([[], [], []]);
  });

  // Final review M2: one definition with the board and the lead page — overdue once the due
  // instant has PASSED (due < now). At the instant itself the step is still due today.
  it("keeps a step due today, not overdue, at exactly its due instant", () => {
    const [digest] = buildLeadDigests([sam], [lead("a", {nextStepDueAt: due})], [], new Date(due.getTime()));
    expect(digest!.overdue).toEqual([]);
    expect(digest!.dueToday.map((item) => item.id)).toEqual(["a"]);
  });

  it("lists an opened invite older than 3 days with no application, once per lead", () => {
    const now = new Date("2026-10-20T00:00:00Z");
    const [digest] = buildLeadDigests([sam], [lead("a")], [
      {contactId: "a", displayName: "Lead a", ownerProfileId: "staff-sam", openedAt: new Date("2026-10-16T23:59:00Z")},
      {contactId: "a", displayName: "Lead a", ownerProfileId: "staff-sam", openedAt: new Date("2026-10-10T00:00:00Z")},
      {contactId: "b", displayName: "Lead b", ownerProfileId: "staff-sam", openedAt: new Date("2026-10-17T00:01:00Z")},
    ], now);
    expect(digest!.stale.map((item) => item.id)).toEqual(["a"]);
  });

  it("shows unowned leads in every staff digest and never in an owner section", () => {
    const now = new Date("2026-10-20T00:00:00Z");
    const digests = buildLeadDigests([sam, lee], [lead("u", {ownerProfileId: null, nextStepDueAt: new Date("2026-10-01T10:00:00Z")})], [], now);
    expect(digests.map((digest) => digest.unassigned.map((item) => item.id))).toEqual([["u"], ["u"]]);
    expect(digests.every((digest) => digest.overdue.length === 0)).toBe(true);
  });

  it("gives each owner only their own steps", () => {
    const now = new Date("2026-10-20T00:00:00Z");
    const past = new Date("2026-10-01T10:00:00Z");
    const [forSam, forLee] = buildLeadDigests([sam, lee], [lead("a", {nextStepDueAt: past}), lead("b", {ownerProfileId: "staff-lee", nextStepDueAt: past})], [], now);
    expect(forSam!.overdue.map((item) => item.id)).toEqual(["a"]);
    expect(forLee!.overdue.map((item) => item.id)).toEqual(["b"]);
  });
});

describe("runLeadReminders", () => {
  const now = new Date("2026-10-20T00:00:00Z"); // 08:00 HKT on the 20th
  const past = new Date("2026-10-15T10:00:00Z");

  it("sends one digest per owner with the HKT-dated idempotency key and the board link", async () => {
    const {deps, sent} = harness({recipients: [sam, lee], leads: [lead("a", {nextStepDueAt: past}), lead("b", {ownerProfileId: "staff-lee", nextStepDueAt: past})]});
    await expect(runLeadReminders(now, deps)).resolves.toEqual({digestsSent: 2, skipped: 0});
    expect(sent.map((message) => message.idempotencyKey)).toEqual([
      "lead-digest:staff-sam:2026-10-20",
      "lead-digest:staff-lee:2026-10-20",
    ]);
    expect(sent[0]!.to).toBe("sam@wtia.example.test");
    expect(sent[0]!.text).toContain("Lead a");
    expect(sent[0]!.text).not.toContain("Lead b");
    expect(sent[0]!.html).toContain("https://wtia.example.test/admin/contacts?view=board");
    expect(sent[1]!.html).toContain("https://wtia.example.test/zh/admin/contacts?view=board");
  });

  it("sends nothing to an owner with nothing to act on", async () => {
    const {deps, sent} = harness({recipients: [sam], leads: [lead("a", {nextStepDueAt: new Date("2026-11-30T10:00:00Z")})]});
    await expect(runLeadReminders(now, deps)).resolves.toEqual({digestsSent: 0, skipped: 1});
    expect(sent).toEqual([]);
  });

  it("uses the same idempotency key for a second run on the same Hong Kong day", async () => {
    const inputs = {leads: [lead("a", {nextStepDueAt: past})]};
    const first = harness(inputs);
    const second = harness(inputs);
    await runLeadReminders(new Date("2026-10-20T00:00:00Z"), first.deps);
    await runLeadReminders(new Date("2026-10-20T14:00:00Z"), second.deps);
    expect(second.sent[0]!.idempotencyKey).toBe(first.sent[0]!.idempotencyKey);
    const nextDay = harness(inputs);
    await runLeadReminders(new Date("2026-10-21T00:00:00Z"), nextDay.deps);
    expect(nextDay.sent[0]!.idempotencyKey).toBe("lead-digest:staff-sam:2026-10-21");
  });

  it("counts a provider refusal as skipped and still sends the others", async () => {
    const {deps, sent} = harness(
      {recipients: [sam, lee], leads: [lead("a", {nextStepDueAt: past}), lead("b", {ownerProfileId: "staff-lee", nextStepDueAt: past})]},
      {failFor: "sam@wtia.example.test"},
    );
    await expect(runLeadReminders(now, deps)).resolves.toEqual({digestsSent: 1, skipped: 1});
    expect(sent.map((message) => message.to)).toEqual(["lee@wtia.example.test"]);
  });

  it("caps a long list and says how many more there are", async () => {
    const leads = Array.from({length: 14}, (_unused, index) => lead(`n${index}`, {nextStepDueAt: past}));
    const {deps, sent} = harness({leads});
    await runLeadReminders(now, deps);
    expect(sent[0]!.text).toContain("Lead n0");
    expect(sent[0]!.text).not.toContain("Lead n13");
    expect(sent[0]!.text).toContain("(+4)");
  });
});

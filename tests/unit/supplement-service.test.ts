import {randomUUID} from "node:crypto";
import {describe, expect, it} from "vitest";
import {createSupplementService, type SupplementRepository, type SupplementState} from "@/lib/membership/supplement-service";
import type {Actor} from "@/lib/membership/lifecycle";

const a = {kind: "member", userId: "auth-a", profileId: "a"} as const;
const b = {kind: "member", userId: "auth-b", profileId: "b", companyRoles: {company: "owner"}} as const;
const staff = {kind: "staff", userId: "auth-staff", profileId: "staff"} as const;
const applicationId = randomUUID();
const items = [{itemId: "website", label: "Company website", required: true}];
const answers = [{itemId: "website", text: "Our website", url: "https://example.test"}];
const op = () => randomUUID();

function setup() {
  let state: SupplementState = {applications: [{id: applicationId, applicantUserId: "a", status: "pending_review"}], requests: [], responses: [], receipts: [], audits: []};
  let tail = Promise.resolve();
  let failure: "before" | "after" | "rollback" | null = null;
  const repository: SupplementRepository = {
    async transaction(work) {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try {
        if (failure === "before") { failure = null; throw Error("offline"); }
        const draft = structuredClone(state);
        const result = await work(draft);
        if (failure === "rollback") { failure = null; throw Error("commit rolled back"); }
        state = draft;
        if (failure === "after") { failure = null; throw Error("lost response"); }
        return result;
      } finally { release(); }
    },
  };
  const service = createSupplementService(repository, {now: () => new Date("2026-10-26T00:00:00Z"), id: randomUUID});
  return {service, state: () => state, fail: (mode: typeof failure) => { failure = mode; }};
}
async function draft(s: ReturnType<typeof setup>) {
  const result = await s.service.createSupplementDraft(staff, {applicationId, items, dueAt: null, staffContext: "STAFF-ONLY-SENTINEL", operationRequestId: op()});
  expect(result.status).toBe("saved");
  if (result.status !== "saved") throw Error("draft not saved");
  return result.reference;
}
async function published(s: ReturnType<typeof setup>) {
  const request = await draft(s);
  const result = await s.service.publishSupplementRequest(staff, {requestId: request.requestId, expectedVersion: request.version, operationRequestId: op()});
  expect(result.status).toBe("saved");
  if (result.status !== "saved") throw Error("publish not saved");
  return result.reference;
}

describe("supplement transaction service (fake repository, not PostgreSQL)", () => {
  it("hides drafts, enforces A-only ownership and never projects staff context", async () => {
    const s = setup(); await draft(s);
    expect(await s.service.listMySupplementRequests(a, {applicationId})).toEqual([]);
    await published(s);
    const rows = await s.service.listMySupplementRequests(a, {applicationId});
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("STAFF-ONLY-SENTINEL");
    await expect(s.service.listMySupplementRequests(b, {applicationId})).rejects.toThrow("FORBIDDEN");
  });
  it("never exposes a draft cancelled before publication", async () => {
    const s = setup(); const r = await draft(s);
    expect(await s.service.cancelSupplementRequest(staff, {requestId: r.requestId, expectedVersion: r.version, reason: "Not ready", operationRequestId: op()})).toMatchObject({status: "saved"});
    expect(await s.service.listMySupplementRequests(a, {applicationId})).toEqual([]);
  });
  it("replays same key and canonical payload; rejects different payload and operation kind", async () => {
    const s = setup(); const operationRequestId = op();
    const input = {applicationId, items, dueAt: null, operationRequestId};
    const saved = await s.service.createSupplementDraft(staff, input);
    expect(await s.service.createSupplementDraft(staff, {...input})).toEqual(saved);
    expect(await s.service.createSupplementDraft(staff, {...input, dueAt: "2026-11-01T00:00:00Z"})).toMatchObject({status: "conflict", reason: "idempotency_key_reused"});
    if (saved.status !== "saved") throw Error("save failed");
    expect(await s.service.publishSupplementRequest(staff, {requestId: saved.reference.requestId, expectedVersion: 1, operationRequestId})).toMatchObject({status: "conflict", reason: "idempotency_key_reused"});
    expect(s.state().requests).toHaveLength(1); expect(s.state().audits).toHaveLength(1); expect(s.state().receipts).toHaveLength(1);
  });
  it("serializes concurrent publication and excludes responded requests from a second open request", async () => {
    const s = setup(); const one = await draft(s); const two = await draft(s);
    const results = await Promise.all([one, two].map(r => s.service.publishSupplementRequest(staff, {requestId: r.requestId, expectedVersion: r.version, operationRequestId: op()})));
    expect(results.map(r => r.status).sort()).toEqual(["conflict", "saved"]);
    const open = s.state().requests.find(r => r.status === "published")!;
    await s.service.respondToSupplementRequest(a, {requestId: open.id, expectedVersion: open.version, answers, operationRequestId: op()});
    const other = s.state().requests.find(r => r.status === "draft")!;
    expect(await s.service.publishSupplementRequest(staff, {requestId: other.id, expectedVersion: other.version, operationRequestId: op()})).toMatchObject({status: "conflict", reason: "open_request_exists"});
  });
  it("retains retry answers for stale and cancelled responses and retains submitted history after cancellation", async () => {
    const s = setup(); const r = await published(s);
    expect(await s.service.respondToSupplementRequest(a, {requestId: r.requestId, expectedVersion: 1, answers, operationRequestId: op()})).toMatchObject({status: "conflict", retryAnswers: answers});
    const result = await s.service.respondToSupplementRequest(a, {requestId: r.requestId, expectedVersion: r.version, answers, operationRequestId: op()});
    expect(result.status).toBe("saved");
    if (result.status !== "saved") throw Error("response failed");
    expect(await s.service.cancelSupplementRequest(staff, {requestId: r.requestId, expectedVersion: result.reference.version, reason: "New requirements", operationRequestId: op()})).toMatchObject({status: "saved"});
    const version = s.state().requests[0].version;
    expect(await s.service.respondToSupplementRequest(a, {requestId: r.requestId, expectedVersion: version, answers, operationRequestId: op()})).toMatchObject({status: "conflict", retryAnswers: answers});
    expect(s.state().responses).toHaveLength(1);
    const rows = await s.service.listMySupplementRequests(a, {applicationId});
    expect(rows[0].responses[0].answers).toEqual(answers);
    expect(rows[0].status).toBe("cancelled");
  });
  it("recovers a saved receipt after a lost response without another response or audit", async () => {
    const s = setup(); const r = await published(s); const operationRequestId = op();
    const input = {requestId: r.requestId, expectedVersion: r.version, answers, operationRequestId};
    s.fail("after");
    expect(await s.service.respondToSupplementRequest(a, input)).toMatchObject({status: "unknown", operationRequestId, retryAnswers: answers});
    const receipt = await s.service.getOperationReceipt(a, {operationRequestId});
    expect(receipt).toMatchObject({status: "saved"});
    expect(await s.service.respondToSupplementRequest(a, input)).toEqual(receipt);
    expect(await s.service.getOperationReceipt(b, {operationRequestId})).toBeNull();
    expect(s.state().responses).toHaveLength(1); expect(s.state().audits).toHaveLength(3);
  });
  it("leaves no response, audit or receipt if the transaction rolls back", async () => {
    const s = setup(); const r = await published(s); const before = structuredClone(s.state());
    s.fail("rollback");
    const operationRequestId = op();
    expect(await s.service.respondToSupplementRequest(a, {requestId: r.requestId, expectedVersion: r.version, answers, operationRequestId})).toMatchObject({status: "unknown", retryAnswers: answers});
    expect(s.state()).toEqual(before);
    expect(await s.service.getOperationReceipt(a, {operationRequestId})).toBeNull();
  });
  it("links replacements to cancelled history and never mutates published content", async () => {
    const s = setup(); const r = await published(s);
    expect(await s.service.createSupplementDraft(staff, {applicationId, items, dueAt: null, replacesRequestId: r.requestId, operationRequestId: op()})).toMatchObject({status: "validation", reason: "invalid_replacement"});
    expect(await s.service.publishSupplementRequest(staff, {requestId: r.requestId, expectedVersion: r.version, operationRequestId: op()})).toMatchObject({status: "conflict", reason: "invalid_state"});
    await s.service.cancelSupplementRequest(staff, {requestId: r.requestId, expectedVersion: r.version, reason: "Superseded", operationRequestId: op()});
    expect(await s.service.createSupplementDraft(staff, {applicationId, items, dueAt: null, replacesRequestId: r.requestId, operationRequestId: op()})).toMatchObject({status: "saved"});
    expect(s.state().requests[1].replacesRequestId).toBe(r.requestId);
    expect(s.state().requests[0].items).toEqual(items);
  });
  it("returns unknown with no invented receipt for pre-commit failure and allows a retry", async () => {
    const s = setup(); const operationRequestId = op(); const input = {applicationId, items, dueAt: null, operationRequestId};
    s.fail("before");
    expect(await s.service.createSupplementDraft(staff, input)).toEqual({status: "unknown", operationRequestId});
    expect(await s.service.getOperationReceipt(staff, {operationRequestId})).toBeNull();
    expect(await s.service.createSupplementDraft(staff, input)).toMatchObject({status: "saved"});
  });
  it.each(["member", "exco", "superadmin", "anonymous", "system"] as const)("rejects %s on all staff mutations", async kind => {
    const s = setup(); const actor = (kind === "member" ? a : kind === "anonymous" ? {kind, userId: null} : kind === "system" ? {kind, userId: null, source: "stripe-webhook"} : {...staff, kind}) as Actor;
    const r = await draft(s); const input = {requestId: r.requestId, expectedVersion: 1, operationRequestId: op()};
    expect(await s.service.createSupplementDraft(actor, {applicationId, items, dueAt: null, operationRequestId: op()})).toMatchObject({status: "forbidden"});
    for (const method of [s.service.publishSupplementRequest, s.service.closeSupplementRequest]) expect(await method(actor, input)).toMatchObject({status: "forbidden"});
    expect(await s.service.cancelSupplementRequest(actor, {...input, reason: "cancel"})).toMatchObject({status: "forbidden"});
  });
  it("only accepts applicant response/list and only closes responded requests", async () => {
    const s = setup(); const r = await published(s); const input = {requestId: r.requestId, expectedVersion: r.version, operationRequestId: op()};
    for (const actor of [b, staff]) {
      expect(await s.service.respondToSupplementRequest(actor, {...input, answers})).toMatchObject({status: "forbidden"});
      await expect(s.service.listMySupplementRequests(actor, {applicationId})).rejects.toThrow("FORBIDDEN");
    }
    expect(await s.service.closeSupplementRequest(staff, input)).toMatchObject({status: "conflict"});
    const responded = await s.service.respondToSupplementRequest(a, {...input, answers});
    if (responded.status !== "saved") throw Error("response failed");
    expect(await s.service.closeSupplementRequest(staff, {...input, operationRequestId: op(), expectedVersion: responded.reference.version})).toMatchObject({status: "saved"});
  });
  it.each(["completed", "abandoned"] as const)("rejects mutations for %s applications while history stays readable", async status => {
    const s = setup(); const r = await published(s); s.state().applications[0].status = status;
    expect(await s.service.respondToSupplementRequest(a, {requestId: r.requestId, expectedVersion: r.version, answers, operationRequestId: op()})).toMatchObject({status: "conflict", reason: "application_not_actionable"});
    expect(await s.service.listMySupplementRequests(a, {applicationId})).toHaveLength(1);
  });
  it("validates prompt/answer limits, duplicate/unknown items, required answers and URL policy", async () => {
    const s = setup();
    for (const badItems of [[], Array.from({length: 11}, (_, i) => ({...items[0], itemId: String(i)})), [{...items[0], label: "x".repeat(501)}], [items[0], items[0]]]) {
      expect(await s.service.createSupplementDraft(staff, {applicationId, items: badItems, dueAt: null, operationRequestId: op()})).toMatchObject({status: "validation"});
    }
    const r = await published(s);
    for (const badAnswers of [[], [{itemId: "unknown", text: "x"}], [{itemId: "website", text: "x".repeat(2001)}], [...answers, ...answers], [{...answers[0], url: "https://wtia.org.hk@evil.example/login"}], [{...answers[0], url: "http://localhost"}]]) {
      expect(await s.service.respondToSupplementRequest(a, {requestId: r.requestId, expectedVersion: r.version, answers: badAnswers, operationRequestId: op()})).toMatchObject({status: "validation"});
    }
    expect(s.state().responses).toHaveLength(0);
  });
});

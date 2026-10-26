import "server-only";
import {createHash, randomUUID} from "node:crypto";
import {z} from "zod";
import {memberSupplementView, type SupplementRequest} from "@/lib/membership/application-supplements";
import {forbidden, type Actor} from "@/lib/membership/lifecycle";
import {canonicalHttpsUrl} from "@/lib/security/https-url";
import type {MembershipApplication} from "@/lib/db/server-schema";

const key = z.string().uuid();
const itemSchema = z.object({itemId: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(500), description: z.string().trim().min(1).max(500).optional(), required: z.boolean()}).strict();
const answerSchema = z.object({itemId: z.string().trim().min(1).max(80), text: z.string().trim().max(2000), url: z.string().max(2048).optional()}).strict();
const uniqueItems = (rows: readonly {itemId: string}[]) => new Set(rows.map(row => row.itemId)).size === rows.length;
const createSchema = z.object({applicationId: key, operationRequestId: key, items: z.array(itemSchema).min(1).max(10).refine(uniqueItems), dueAt: z.string().datetime({offset: true}).nullable(), staffContext: z.string().max(4000).optional(), replacesRequestId: key.optional()}).strict();
const transitionSchema = z.object({requestId: key, expectedVersion: z.number().int().positive(), operationRequestId: key}).strict();
const respondSchema = transitionSchema.extend({answers: z.array(answerSchema).max(10).refine(uniqueItems)});
const cancelSchema = transitionSchema.extend({reason: z.string().trim().min(1).max(500)});
type Kind = "create" | "publish" | "respond" | "close" | "cancel";
export type SupplementAnswer = z.infer<typeof answerSchema>;
export type SupplementReference = {applicationId: string; requestId: string; version: number; responseId?: string};
export type SupplementResult =
  | {status: "saved"; operationRequestId: string; reference: SupplementReference}
  | {status: "conflict"; reason: string; retryAnswers?: readonly SupplementAnswer[]}
  | {status: "unknown"; operationRequestId: string; retryAnswers?: readonly SupplementAnswer[]}
  | {status: "validation"; reason: string}
  | {status: "forbidden"};
type Saved = Extract<SupplementResult, {status: "saved"}>;
export type StoredSupplement = Omit<SupplementRequest, "items"> & {
  items: readonly z.infer<typeof itemSchema>[];
  createdBy: string; publishedAt: string | null; closedAt: string | null;
  staffContext?: string; replacesRequestId?: string; cancellationReason?: string;
};
type Response = {id: string; requestId: string; requestVersion: number; applicantUserId: string; answers: readonly SupplementAnswer[]; submittedAt: string; operationId: string};
export type SupplementState = {
  applications: Pick<MembershipApplication, "id" | "applicantUserId" | "status">[];
  requests: StoredSupplement[];
  responses: Response[];
  receipts: {actor: string; kind: Kind; payloadHash: string; result: Saved}[];
  audits: {actor: string; kind: Kind; requestId: string; operationRequestId: string; at: string}[];
};
/** Offline transactional port, not a database adapter. Implementations MUST serialize
 * transactions, roll back on failure and atomically commit records, audit and receipts.
 * A future SQL adapter additionally needs the partial unique open-request constraint.
 * No default repository or runtime entrypoint is installed by this module. */
export interface SupplementRepository {
  transaction<T>(work: (state: SupplementState) => Promise<T>): Promise<T>;
}
function actorKey(actor: Actor): string | null {
  return "profileId" in actor ? `${actor.kind}:${actor.profileId}` : null;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function createSupplementService(repository: SupplementRepository, deps = {now: () => new Date(), id: randomUUID}) {
  async function mutate(actor: Actor, kind: Kind, raw: unknown): Promise<SupplementResult> {
    if (kind === "respond" ? actor.kind !== "member" : actor.kind !== "staff") return {status: "forbidden"};
    const schemas = {
      create: createSchema.transform(input => ({...input, kind: "create" as const})),
      respond: respondSchema.transform(input => ({...input, kind: "respond" as const})),
      cancel: cancelSchema.transform(input => ({...input, kind: "cancel" as const})),
      publish: transitionSchema.transform(input => ({...input, kind: "publish" as const})),
      close: transitionSchema.transform(input => ({...input, kind: "close" as const})),
    };
    const schema = schemas[kind];
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return {status: "validation", reason: "invalid_input"};
    const input = parsed.data;
    const retry = "answers" in input ? {retryAnswers: input.answers} : {};
    if ("answers" in input) {
      try { for (const answer of input.answers) if (answer.url) canonicalHttpsUrl(answer.url, {allowQuery: true}); }
      catch { return {status: "validation", reason: "invalid_url"}; }
    }
    const identity = actorKey(actor)!;
    const payloadHash = createHash("sha256").update(canonical({kind, input})).digest("hex");
    try {
      return await repository.transaction(async state => {
        const request = "requestId" in input ? state.requests.find(r => r.id === input.requestId) : undefined;
        const applicationId = "applicationId" in input ? input.applicationId : request?.applicationId;
        const application = state.applications.find(row => row.id === applicationId);
        if (!application || (actor.kind === "member" && application.applicantUserId !== actor.profileId)) return {status: "forbidden"};
        const prior = state.receipts.find(r => r.actor === identity && r.result.operationRequestId === input.operationRequestId);
        if (prior) return prior.payloadHash === payloadHash ? structuredClone(prior.result) : {status: "conflict", reason: "idempotency_key_reused", ...retry};
        if (application.status !== "draft" && application.status !== "pending_review" && application.status !== "pending_payment") return {status: "conflict", reason: "application_not_actionable", ...retry};
        const now = deps.now().toISOString();
        let target: StoredSupplement;
        let responseId: string | undefined;
        if ("applicationId" in input) {
          if (input.replacesRequestId) {
            const old = state.requests.find(r => r.id === input.replacesRequestId);
            if (!old || old.applicationId !== application.id || old.status !== "cancelled") return {status: "validation", reason: "invalid_replacement"};
          }
          target = {id: deps.id(), applicationId: application.id, applicantUserId: application.applicantUserId, version: 1, status: "draft", items: structuredClone(input.items), dueAt: input.dueAt, createdBy: actorKey(actor)!, publishedAt: null, closedAt: null, staffContext: input.staffContext, replacesRequestId: input.replacesRequestId};
          state.requests.push(target);
        } else {
          if (!request || request.version !== input.expectedVersion) return {status: "conflict", reason: "stale_version", ...retry};
          const allowed = kind === "publish" ? request.status === "draft" : kind === "respond" ? request.status === "published" : kind === "close" ? request.status === "responded" : ["draft", "published", "responded"].includes(request.status);
          if (!allowed) return {status: "conflict", reason: "invalid_state", ...retry};
          if (kind === "publish" && state.requests.some(r => r.id !== request.id && r.applicationId === application.id && (r.status === "published" || r.status === "responded"))) return {status: "conflict", reason: "open_request_exists"};
          if ("answers" in input) {
            const answers = input.answers;
            if (answers.some(a => !request.items.some(i => i.itemId === a.itemId)) || request.items.some(i => i.required && !answers.some(a => a.itemId === i.itemId && (a.text.length > 0 || a.url)))) return {status: "validation", reason: "invalid_answers"};
            responseId = deps.id();
            state.responses.push({id: responseId, requestId: request.id, requestVersion: request.version, applicantUserId: application.applicantUserId, answers: structuredClone(answers), submittedAt: now, operationId: input.operationRequestId});
          }
          target = {...request, version: request.version + 1, status: kind === "publish" ? "published" : kind === "respond" ? "responded" : kind === "close" ? "closed" : "cancelled", ...(kind === "publish" ? {publishedAt: now} : {}), ...(kind === "close" || kind === "cancel" ? {closedAt: now} : {}), ...("reason" in input ? {cancellationReason: input.reason} : {})};
          state.requests[state.requests.indexOf(request)] = target;
        }
        const result: Saved = {status: "saved", operationRequestId: input.operationRequestId, reference: {applicationId: application.id, requestId: target.id, version: target.version, ...(responseId ? {responseId} : {})}};
        state.audits.push({actor: identity, kind, requestId: target.id, operationRequestId: input.operationRequestId, at: now});
        state.receipts.push({actor: identity, kind, payloadHash, result: structuredClone(result)});
        return result;
      });
    } catch { return {status: "unknown", operationRequestId: input.operationRequestId, ...retry}; }
  }
  return {
    createSupplementDraft: (actor: Actor, input: unknown) => mutate(actor, "create", input),
    publishSupplementRequest: (actor: Actor, input: unknown) => mutate(actor, "publish", input),
    respondToSupplementRequest: (actor: Actor, input: unknown) => mutate(actor, "respond", input),
    closeSupplementRequest: (actor: Actor, input: unknown) => mutate(actor, "close", input),
    cancelSupplementRequest: (actor: Actor, input: unknown) => mutate(actor, "cancel", input),
    async listMySupplementRequests(actor: Actor, raw: unknown) {
      if (actor.kind !== "member") forbidden();
      const {applicationId} = z.object({applicationId: key}).strict().parse(raw);
      return repository.transaction(async state => {
        if (!state.applications.some(app => app.id === applicationId && app.applicantUserId === actor.profileId)) forbidden();
        return state.requests.filter(r => r.applicationId === applicationId && r.status !== "draft" && r.publishedAt !== null).map(request => ({
          ...memberSupplementView(actor, request)!,
          items: request.items.map(({itemId, label, description, required}) => ({itemId, label, ...(description ? {description} : {}), required})),
          responses: state.responses.filter(r => r.requestId === request.id && r.applicantUserId === actor.profileId).map(({id, requestVersion, answers, submittedAt, operationId}) => ({id, requestVersion, answers: structuredClone(answers), submittedAt, operationId})),
        }));
      });
    },
    async getOperationReceipt(actor: Actor, raw: unknown): Promise<Saved | null> {
      const identity = actorKey(actor);
      if (!identity || (actor.kind !== "member" && actor.kind !== "staff")) forbidden();
      const {operationRequestId} = z.object({operationRequestId: key}).strict().parse(raw);
      return repository.transaction(async state => {
        const receipt = state.receipts.find(r => r.actor === identity && r.result.operationRequestId === operationRequestId);
        if (!receipt) return null;
        if (actor.kind === "member" && !state.applications.some(app => app.id === receipt.result.reference.applicationId && app.applicantUserId === actor.profileId)) forbidden();
        return structuredClone(receipt.result);
      });
    },
  };
}

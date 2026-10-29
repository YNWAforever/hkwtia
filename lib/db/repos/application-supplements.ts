import "server-only";
import {and, eq, sql} from "drizzle-orm";
import type {SupplementRepository, SupplementState, StoredSupplement} from "@/lib/membership/supplement-service";
import {applicationSupplementRequests as requests, applicationSupplementResponses as responses, applicationSupplementReceipts as receipts, membershipApplications as applications, auditEvents} from "@/lib/db/server-schema";
import {getDb, type Database} from "./common";

/** Injectable only: no default instance, action, session loader or provider.
 * Actor-key lock serializes receipt reuse across applications; application row lock
 * serializes lifecycle checks and all supplement transitions. Always lock in that order.
 * The state port is scoped to one application; only changed requests and new immutable
 * responses/receipts/audits are persisted. Member projection remains in the service.
 */
export function createSupplementRepository(load: () => Promise<Database> = getDb): SupplementRepository {
  return {
    async transaction(work, scope) {
      if (!scope?.actor || (!scope.applicationId && !scope.requestId && !scope.operationRequestId)) throw Error("SUPPLEMENT_SCOPE_REQUIRED");
      const db = await load();
      return db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(2204, hashtext(${scope.actor}))`);
        const prior = scope.operationRequestId
          ? await tx.select().from(receipts).where(and(eq(receipts.actor,scope.actor),eq(receipts.operationRequestId,scope.operationRequestId)))
          : [];
        const found = scope.requestId
          ? await tx.select({applicationId:requests.applicationId}).from(requests).where(eq(requests.id,scope.requestId))
          : [];
        const applicationId = scope.applicationId ?? found[0]?.applicationId ?? prior[0]?.applicationId;
        const appRows = applicationId
          ? await tx.select({id:applications.id,applicantUserId:applications.applicantUserId,status:applications.status}).from(applications).where(eq(applications.id,applicationId)).for("update")
          : [];
        const app = appRows[0];
        // A member cannot load another applicant's private request rows into the port.
        const owned = app && (!scope.actor.startsWith("member:") || scope.actor === `member:${app.applicantUserId}`);
        const stored = owned ? await tx.select().from(requests).where(eq(requests.applicationId,app.id)) : [];
        const state: SupplementState = {
          applications: owned ? [app] : [],
          requests: stored.map((r): StoredSupplement => ({
            ...r, applicantUserId:app!.applicantUserId,
            staffContext:r.staffContext ?? undefined,
            replacesRequestId:r.replacesRequestId ?? undefined,
            cancellationReason:r.cancellationReason ?? undefined,
          })),
          responses: owned ? await tx.select({
            id:responses.id, requestId:responses.requestId, requestVersion:responses.requestVersion,
            applicantUserId:responses.applicantUserId, answers:responses.answers,
            submittedAt:responses.submittedAt, operationId:responses.operationId,
          }).from(responses).innerJoin(requests,eq(responses.requestId,requests.id)).where(eq(requests.applicationId,app.id)) : [],
          receipts: owned ? prior.map(({actor,kind,payloadHash,result})=>({actor,kind,payloadHash,result})) : [],
          audits: [],
        };
        const before = structuredClone(state);
        const result = await work(state);
        for (const r of state.requests) {
          const old = before.requests.find(x=>x.id===r.id);
          if (old && JSON.stringify(old)===JSON.stringify(r)) continue;
          if (!old) await tx.insert(requests).values({
            id:r.id, applicationId:r.applicationId, version:r.version, status:r.status,
            items:r.items, dueAt:r.dueAt, createdBy:r.createdBy, publishedAt:r.publishedAt,
            closedAt:r.closedAt, staffContext:r.staffContext, replacesRequestId:r.replacesRequestId,
            cancellationReason:r.cancellationReason,
          });
          else {
            // Published item content is immutable even if an internal caller misuses the port.
            await tx.update(requests).set({
              version:r.version, status:r.status, publishedAt:r.publishedAt,
              closedAt:r.closedAt, cancellationReason:r.cancellationReason,
            }).where(and(eq(requests.id,r.id),eq(requests.version,old.version)));
          }
        }
        for (const r of state.responses.slice(before.responses.length)) await tx.insert(responses).values(r);
        for (const r of state.receipts.slice(before.receipts.length)) await tx.insert(receipts).values({
          ...r, operationRequestId:r.result.operationRequestId,
          applicationId:r.result.reference.applicationId,requestId:r.result.reference.requestId,
        });
        for (const a of state.audits) {
          const split = a.actor.indexOf(":");
          await tx.insert(auditEvents).values({
            actorType:a.actor.slice(0,split),actorUserId:a.actor.slice(split+1),
            action:`application_supplement.${a.kind}`,targetType:"application_supplement",
            targetId:a.requestId,requestId:a.operationRequestId,createdAt:new Date(a.at),
            metadata:{operationKind:a.kind},
          });
        }
        return result;
      });
    },
  };
}

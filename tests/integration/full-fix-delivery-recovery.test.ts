// @vitest-environment node
import { ticketResendBatchHandler } from "@/lib/db/repos/batch-handlers/ticket-resend";
import { batchRequestSchema } from "@/lib/admin/batches/types";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isolatedAuditDatabase } from "./audit-database-fixture";
import { createInboxRepository } from "@/lib/db/repos/inbox";
import { createMessageEligibilityRepository } from "@/lib/db/repos/message-eligibility";
import { createWoztellInboundEventsRepository, woztellWebhookActor } from "@/lib/db/repos/woztell-inbound-events";
import { sendInboxReply, type InboxReplyDependencies } from "@/lib/admin/inbox-action-core";
import { createDeliveriesRepository, notificationActor } from "@/lib/db/repos/deliveries";
import { dispatchNotification, type NotificationDispatchDependencies } from "@/lib/notifications/dispatch";
import { renderEmail } from "@/lib/email/render";
import { createTestTransport } from "@/lib/email/transport";
import { unsubscribeUrls } from "@/lib/email/unsubscribe-urls";
import { runCampaignBatch, createCampaignEmailRenderer, type CampaignRunnerDependencies } from "@/lib/automation/campaign-runner";
import { createTicketEmailOutboxRepository } from "@/lib/db/repos/ticket-email-outbox";
import { createShowcaseLeadEmailOutboxRepository } from "@/lib/db/repos/showcase-lead-email-outbox";
import { createCampaignsRepository } from "@/lib/db/repos/campaigns";
import type { Database } from "@/lib/db/repos/common";
import { createCampaignRecipientDeliveryRepository } from "@/lib/db/repos/campaign-recipient-delivery";
import { runJourneyBatch, type JourneyRunnerDependencies } from "@/lib/automation/journey-runner";
import { createJourneysRepository } from "@/lib/db/repos/journeys";
import { createStaffTasksRepository } from "@/lib/db/repos/staff-tasks";
import { automationCronActor } from "@/lib/auth/automation-actor";
import { DeliveryFailure } from "@/lib/email/transport";
import { WoztellDeliveryFailure } from "@/lib/channels/woztell";
const isolated = vi.hoisted(() => ({database: null as Awaited<ReturnType<typeof isolatedAuditDatabase>>['database'] | null}));
vi.mock('@/lib/db/repos/common', async original => ({...await original<typeof import('@/lib/db/repos/common')>(), getDb: async () => {if (!isolated.database) throw Error('ISOLATED_DATABASE_NOT_READY'); return isolated.database;}}));
import {eventOrdersRepository} from '@/lib/db/repos/event-orders';
import {resendStaffPass} from '@/lib/admin/ticket-resend';
const staff = { kind: "staff", profileId: "t14d-staff", userId: "t14d-auth" } as const;
const member = { kind: "member", profileId: "t14d-member", userId: "t14d-member-auth" } as const;
let f: Awaited<ReturnType<typeof isolatedAuditDatabase>>;
let inbox: ReturnType<typeof createInboxRepository>, eligibility: ReturnType<typeof createMessageEligibilityRepository>, callbacks: ReturnType<typeof createWoztellInboundEventsRepository>;
const now = () => new Date();
async function seed() {
    await f.pool.query("INSERT INTO profiles(id,auth_user_id,display_name,role,email,consent_marketing,whatsapp_opt_in,whatsapp_number) VALUES('t14d-staff','t14d-auth','Synthetic Staff','staff','staff@example.test',false,false,null),('t14d-member','t14d-member-auth','Synthetic Member','member','member@example.test',true,true,'+85290000000')");
    const id = randomUUID();
    await f.pool.query("INSERT INTO conversations(id,profile_id,channel,handling,last_inbound_at,expires_at) VALUES($1,'t14d-member','whatsapp','human',now(),now()+interval '1 day')", [id]);
    return id;
}
function input(id: string, attempt = randomUUID()) { return { conversationId: id, kind: "session" as const, content: "Synthetic staff reply", templateKey: null, templateVariables: {}, attemptId: attempt }; }
function ports(queue = inbox.queueStaffMessage): InboxReplyDependencies {
    return { inbox: { ...inbox, queueStaffMessage: queue }, eligibility, channel: { sendSessionMessage: vi.fn(async () => ({ status: "sent" as const, providerId: "wamid.synthetic." + randomUUID() })), sendTemplateMessage: vi.fn(async () => ({ status: "sent" as const, providerId: "wamid.synthetic." + randomUUID() })) }, approvedTemplateKeys: () => new Set(), now };
}
async function ledger(id: string) { return (await f.pool.query("SELECT id,delivery_status,error_code,provider_message_id,delivered_at,read_at,send_claim_expires_at FROM messages WHERE conversation_id=$1 AND direction='outbound' ORDER BY created_at,id", [id])).rows; }
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")("staff delivery recovery on actual all-migration PostgreSQL; synthetic provider boundary only", () => {
    beforeAll(async () => { f = await isolatedAuditDatabase(); isolated.database = f.database; const load = async () => f.database; inbox = createInboxRepository(load); eligibility = createMessageEligibilityRepository(load); callbacks = createWoztellInboundEventsRepository(now, load); }, 120000);
    beforeEach(async () => { await f.pool.query("TRUNCATE profiles CASCADE"); });
    afterAll(async () => { if (f)
        await f.close(); });
    it("STOP committed after queue but before transport refuses the send and retains a truthful failed ledger", async () => { const id = await seed(), deps = ports(async (a, x) => { const r = await inbox.queueStaffMessage(a, x); await f.pool.query("UPDATE profiles SET whatsapp_opt_in=false WHERE id='t14d-member'; INSERT INTO message_suppressions(profile_id,channel,classification) VALUES('t14d-member','whatsapp','marketing')"); return r; }); await expect(sendInboxReply(staff, input(id), deps)).rejects.toMatchObject({ code: "OPTED_OUT" }); expect(deps.channel.sendSessionMessage).not.toHaveBeenCalled(); const rows = await ledger(id); expect(rows).toHaveLength(1); expect(rows[0].delivery_status).toBe("failed"); expect(rows[0].provider_message_id).toBeNull(); expect(rows[0].send_claim_expires_at).toBeNull(); });
    it("contact STOP after queue is read from the contact store rather than member opt-in", async () => { const id = await seed(), contact = randomUUID(); await f.pool.query("INSERT INTO contacts(id,source,phone_e164,whatsapp_opt_in) VALUES($1,'whatsapp','+85290000001',true)", [contact]); await f.pool.query("UPDATE conversations SET contact_id=$2 WHERE id=$1", [id, contact]); const deps = ports(async (a, x) => { const r = await inbox.queueStaffMessage(a, x); await f.pool.query("UPDATE contacts SET whatsapp_opted_out_at=now() WHERE id=$1", [contact]); return r; }); await expect(sendInboxReply(staff, input(id), deps)).rejects.toMatchObject({ code: "OPTED_OUT" }); expect(deps.channel.sendSessionMessage).not.toHaveBeenCalled(); });
    it("a takeover change after the send claim stops the old human operation", async () => { const id = await seed(), deps = ports(async (a, x) => { const r = await inbox.queueStaffMessage(a, x); await f.pool.query("UPDATE conversations SET handling='bot' WHERE id=$1", [id]); return r; }); await expect(sendInboxReply(staff, input(id), deps)).rejects.toMatchObject({ code: "INVALID_INBOX_HANDLING" }); expect(deps.channel.sendSessionMessage).not.toHaveBeenCalled(); expect((await ledger(id))[0].delivery_status).toBe("failed"); });
    it("a changed recipient link cannot receive an earlier queued reply", async () => { const id = await seed(), contact = randomUUID(); await f.pool.query("INSERT INTO contacts(id,source,phone_e164,whatsapp_opt_in) VALUES($1,'whatsapp','+85290000002',true)", [contact]); const deps = ports(async (a, x) => { const r = await inbox.queueStaffMessage(a, x); await f.pool.query("UPDATE conversations SET contact_id=$2 WHERE id=$1", [id, contact]); return r; }); await expect(sendInboxReply(staff, input(id), deps)).rejects.toMatchObject({ code: "INVALID" }); expect(deps.channel.sendSessionMessage).not.toHaveBeenCalled(); });
    it("unknown acceptance is not retried; a matching synthetic provider echo and delivered/read ticks reconcile the same row", async () => { const id = await seed(), request = input(id), deps = ports(); vi.mocked(deps.channel.sendSessionMessage).mockRejectedValue(new WoztellDeliveryFailure("retryable_network")); await expect(sendInboxReply(staff, request, deps)).rejects.toMatchObject({ code: "DELIVERY_UNCERTAIN" }); await expect(sendInboxReply(staff, request, deps)).rejects.toMatchObject({ code: "DELIVERY_UNCERTAIN" }); expect(deps.channel.sendSessionMessage).toHaveBeenCalledTimes(1); const provider = "wamid.synthetic." + randomUUID(), echo = { recipient: "+85290000000", text: request.content, providerMessageId: provider, origin: "RELAY" as const, sentAt: now() }; expect(await callbacks.recordOutboundEcho(woztellWebhookActor(), echo)).toEqual({ disposition: "adopted" }); expect(await callbacks.recordOutboundEcho(woztellWebhookActor(), echo)).toEqual({ disposition: "duplicate" }); let rows = await ledger(id); expect(rows).toHaveLength(1); expect(rows[0].delivery_status).toBe("sent"); expect(rows[0].delivered_at).toBeNull(); const tick = { providerMessageId: provider, status: "delivered" as const, errorCode: null, occurredAt: now() }; expect((await callbacks.recordDeliveryStatus(woztellWebhookActor(), tick)).matched).toBe(true); await callbacks.recordDeliveryStatus(woztellWebhookActor(), { ...tick, status: "read" }); await callbacks.recordDeliveryStatus(woztellWebhookActor(), { ...tick, status: "sent" }); rows = await ledger(id); expect(rows[0].delivery_status).toBe("read"); expect(rows[0].delivered_at).not.toBeNull(); expect(rows[0].read_at).not.toBeNull(); await expect(sendInboxReply(staff, request, deps)).resolves.toMatchObject({ status: "already_sent" }); expect(deps.channel.sendSessionMessage).toHaveBeenCalledTimes(1); expect(Number((await f.pool.query("SELECT count(*) AS n FROM audit_events WHERE target_id=$1 AND action='conversation.reply.queued'", [id])).rows[0].n)).toBe(1); });
    it("a new client attempt cannot bypass an unresolved identical send", async () => { const id = await seed(), deps = ports(); vi.mocked(deps.channel.sendSessionMessage).mockRejectedValue(new WoztellDeliveryFailure("retryable_network")); await expect(sendInboxReply(staff, input(id), deps)).rejects.toMatchObject({ code: "DELIVERY_UNCERTAIN" }); await expect(sendInboxReply(staff, input(id), deps)).rejects.toMatchObject({ code: "DELIVERY_UNCERTAIN" }); expect(deps.channel.sendSessionMessage).toHaveBeenCalledTimes(1); expect(await ledger(id)).toHaveLength(1); });
    it("an ambiguous identical echo never selects one of two queued attempts by recency", async () => { const id = await seed(), { outboundKeyFor } = await import("@/lib/admin/inbox-action-core"); const r = input(id); await inbox.queueStaffMessage(staff, { conversationId: id, kind: r.kind, content: r.content, templateKey: null, templateVariables: {}, outboundKey: outboundKeyFor(r) }); /* Historical ambiguity fixture: the repaired queue now refuses a second unresolved identical attempt. */ await f.pool.query("INSERT INTO messages(conversation_id,role,channel,direction,content,delivery_status,sent_by_profile_id,outbound_key,send_claim_expires_at) VALUES($1,'staff','whatsapp','outbound',$2,'queued',$3,$4,now()+interval '2 minutes')", [id, r.content, staff.profileId, outboundKeyFor(input(id))]); expect(await callbacks.recordOutboundEcho(woztellWebhookActor(), { recipient: "+85290000000", text: "Synthetic staff reply", providerMessageId: "wamid.synthetic." + randomUUID(), origin: "RELAY", sentAt: now() })).toEqual({ disposition: "inserted" }); const rows = await ledger(id); expect(rows.filter(r => r.delivery_status === "queued" && r.provider_message_id === null)).toHaveLength(2); expect(rows).toHaveLength(3); });
    it("wrong-locale approved template is refused before the queue or provider", async () => { const id = await seed(), deps = { ...ports(), approvedTemplateKeys: () => new Set(["concierge_follow_up_en"] as const) }; await f.pool.query("UPDATE conversations SET locale='zh-HK' WHERE id=$1", [id]); await expect(sendInboxReply(staff, { ...input(id), kind: "template", templateKey: "concierge_follow_up_en", templateVariables: { memberName: "Synthetic", supportUrl: "https://preview.example.test/contact" } }, deps)).rejects.toMatchObject({ code: "INVALID" }); expect(deps.channel.sendTemplateMessage).not.toHaveBeenCalled(); expect(await ledger(id)).toHaveLength(0); });
    it("template approval withdrawn during queue is rechecked before effects", async () => { const id = await seed(); let reads = 0; const deps = { ...ports(), approvedTemplateKeys: () => ++reads === 1 ? new Set(["concierge_follow_up_en"] as const) : new Set<never>() }; await expect(sendInboxReply(staff, { ...input(id), kind: "template", templateKey: "concierge_follow_up_en", templateVariables: { memberName: "Synthetic", supportUrl: "https://preview.example.test/contact" } }, deps)).rejects.toMatchObject({ code: "TEMPLATE_NOT_APPROVED" }); expect(deps.channel.sendTemplateMessage).not.toHaveBeenCalled(); expect((await ledger(id))[0].error_code).toBe("pre_send_blocked"); });
    it("a provider-declared refusal can retry the same effect and same SQL row", async () => { const id = await seed(), request = input(id), deps = ports(); vi.mocked(deps.channel.sendSessionMessage).mockRejectedValueOnce(new WoztellDeliveryFailure("provider_client_error")); await expect(sendInboxReply(staff, request, deps)).rejects.toMatchObject({ code: "DELIVERY_FAILED" }); await expect(sendInboxReply(staff, request, deps)).resolves.toMatchObject({ status: "sent" }); expect(deps.channel.sendSessionMessage).toHaveBeenCalledTimes(2); expect(await ledger(id)).toHaveLength(1); });
    it("worker crash with an expired queued lease remains uncertain and never inherits a send", async () => { const id = await seed(), request = input(id), deps = ports(); const { outboundKeyFor } = await import("@/lib/admin/inbox-action-core"); await inbox.queueStaffMessage(staff, { conversationId: id, kind: request.kind, content: request.content, templateKey: null, templateVariables: {}, outboundKey: outboundKeyFor(request) }); await f.pool.query("UPDATE messages SET send_claim_expires_at=now()-interval '1 hour' WHERE conversation_id=$1", [id]); await expect(sendInboxReply(staff, request, deps)).rejects.toMatchObject({ code: "DELIVERY_UNCERTAIN" }); expect(deps.channel.sendSessionMessage).not.toHaveBeenCalled(); expect((await ledger(id))[0].delivery_status).toBe("queued"); });
    it("later legitimate identical replies have distinct attempts while same-attempt replay sends once", async () => { const id = await seed(), one = input(id), deps = ports(); await sendInboxReply(staff, one, deps); await sendInboxReply(staff, one, deps); await sendInboxReply(staff, input(id), deps); expect(deps.channel.sendSessionMessage).toHaveBeenCalledTimes(2); expect(await ledger(id)).toHaveLength(2); });
    it("campaign timeout is an unknown effect and does not retry the same persisted delivery", async () => { await seed(); const contact = randomUUID(); await f.pool.query("INSERT INTO contacts(id,source,phone_e164,whatsapp_opt_in) VALUES($1,'whatsapp','+85290000003',true)", [contact]); const deliveries = createDeliveriesRepository(async () => f.database), send = vi.fn(async () => { throw new WoztellDeliveryFailure("retryable_network"); }), deps: NotificationDispatchDependencies = { eligibility, deliveries, templates: { approved: async () => ({ keys: new Set(["wtia_announcement_en"]), empty: false }) }, whatsappTransport: { sendTemplateMessage: send }, emailTransport: createTestTransport(), renderEmail, unsubscribeUrls, emailFrom: "Synthetic <test@example.test>" }; const request = { recipient: { kind: "contact" as const, contactId: contact }, channel: "whatsapp" as const, template: "wtia_announcement_en" as const, variables: { memberName: "Synthetic", headline: "Synthetic Notice", detailUrl: "https://preview.example.test/news" }, idempotencyKey: "notify:t14d:" + randomUUID() }; expect(await dispatchNotification(notificationActor("campaign"), request, deps)).toMatchObject({ status: "failed" }); expect(await dispatchNotification(notificationActor("campaign"), request, deps)).toMatchObject({ status: "failed" }); expect(send).toHaveBeenCalledTimes(1); const rows = await f.pool.query("SELECT status,error_code,attempt_count FROM whatsapp_log WHERE idempotency_key=$1", [request.idempotencyKey]); expect(rows.rows).toEqual([{ status: "failed", error_code: "provider_acceptance_uncertain", attempt_count: 1 }]); });
    it("campaign STOP committed during reservation blocks dispatch using fresh actual contact facts", async () => { await seed(); const contact = randomUUID(); await f.pool.query("INSERT INTO contacts(id,source,phone_e164,whatsapp_opt_in) VALUES($1,'whatsapp','+85290000003',true)", [contact]); const deliveries = createDeliveriesRepository(async () => f.database), send = vi.fn(async () => ({ status: "sent" as const, providerId: "wamid.synthetic" })), deps: NotificationDispatchDependencies = { eligibility, deliveries: { ...deliveries, reserveWhatsapp: async (a, x) => { const r = await deliveries.reserveWhatsapp(a, x); await f.pool.query("UPDATE contacts SET whatsapp_opted_out_at=now() WHERE id=$1", [contact]); return r; } }, templates: { approved: async () => ({ keys: new Set(["wtia_announcement_en"]), empty: false }) }, whatsappTransport: { sendTemplateMessage: send }, emailTransport: createTestTransport(), renderEmail, unsubscribeUrls, emailFrom: "Synthetic <test@example.test>" }; const request = { recipient: { kind: "contact" as const, contactId: contact }, channel: "whatsapp" as const, template: "wtia_announcement_en" as const, variables: { memberName: "Synthetic", headline: "Synthetic Notice", detailUrl: "https://preview.example.test/news" }, idempotencyKey: "notify:t14d:" + randomUUID() }; expect(await dispatchNotification(notificationActor("campaign"), request, deps)).toEqual({ status: "skipped", reason: "suppressed" }); expect(send).not.toHaveBeenCalled(); expect((await f.pool.query("SELECT status,provider_id FROM whatsapp_log WHERE idempotency_key=$1", [request.idempotencyKey])).rows).toEqual([{ status: "failed", provider_id: null }]); });
    it("member actor cannot queue/reply or manufacture provider callbacks", async () => { const id = await seed(), deps = ports(); await expect(sendInboxReply(member, input(id), deps)).rejects.toThrow("FORBIDDEN"); await expect(callbacks.recordDeliveryStatus(member, { providerMessageId: "synthetic", status: "delivered", errorCode: null, occurredAt: now() })).rejects.toThrow("FORBIDDEN"); expect(await ledger(id)).toHaveLength(0); });
    async function journeyFixture(step = "welcome") {
        await seed();
        const journeys = createJourneysRepository(async () => f.database), deliveries = createDeliveriesRepository(async () => f.database);
        const key = "journey:t14d:" + randomUUID(), instant = new Date();
        await journeys.enroll(automationCronActor(), { profileId: "t14d-member", membershipId: null, journey: "onboarding_90d", instanceKey: key, step, scheduledAt: new Date(instant.getTime() - 1000), deliveryKey: key });
        const send = vi.fn(async () => ({ status: "sent" as const, providerId: "email.synthetic." + randomUUID() }));
        const deps: JourneyRunnerDependencies = {
            journeys, deliveries, staffTasks: createStaffTasksRepository(async () => f.database),
            memberships: { lapseDunningEpisode: async () => ({ disposition: "resolved", createdTasks: 0, createdSteps: 0 }) },
            loadContext: async () => {
                const row = (await f.pool.query("SELECT email,consent_marketing,(SELECT count(*)>0 FROM message_suppressions WHERE profile_id=profiles.id AND channel='email') AS suppressed FROM profiles WHERE id='t14d-member'")).rows[0];
                return { hasLoggedIn: false, profileCompleteness: 50, marketingConsent: row.consent_marketing, emailSuppressed: row.suppressed, whatsappOptIn: false, whatsappOptedOutAt: null, whatsappNumber: null, engagementScore: 50, email: row.email, recipientName: "Synthetic Member", locale: "en", variables: { ctaUrl: "https://preview.example.test/portal" }, unsubscribeUrl: "https://preview.example.test/unsubscribe", unsubscribeOneClickUrl: "https://preview.example.test/api/unsubscribe", membershipStatus: null };
            },
            renderEmail, emailTransport: { send }, whatsappTransport: { sendTemplateMessage: async () => ({ status: "skipped", reason: "recipient_ineligible" }) }, approvedTemplateKeys: new Set(), emailFrom: "Synthetic <test@example.test>",
        };
        return { deps, journeys, deliveries, key, instant, send };
    }
    it.each(["retryable_network", "retryable_server"] as const)("journey provider %s is reconciled before any second send or administrative retry", async code => {
        const j = await journeyFixture(); j.send.mockRejectedValue(new DeliveryFailure(code));
        await runJourneyBatch(j.deps, { now: j.instant, limit: 1 });
        await runJourneyBatch(j.deps, { now: new Date(j.instant.getTime() + 6 * 60000), limit: 1 });
        expect(j.send).toHaveBeenCalledTimes(1);
        const log = (await f.pool.query("SELECT id,status,error_code,attempt_count FROM email_log WHERE idempotency_key=$1", [j.key])).rows[0];
        expect(log).toMatchObject({ status: "failed", error_code: "provider_acceptance_uncertain", attempt_count: 1 });
        await expect(j.deliveries.retryEmailFailure(automationCronActor(), log.id, "provider_acceptance_uncertain")).rejects.toThrow("INVALID_DELIVERY_RETRY");
        const journey = (await f.pool.query("SELECT id,status,error_code FROM journey_state WHERE delivery_key=$1", [j.key])).rows[0];
        expect(journey).toMatchObject({ status: "failed", error_code: "provider_acceptance_uncertain" });
        await expect(j.journeys.retryFailed(staff, journey.id, new Date())).rejects.toThrow("DELIVERY_RECONCILIATION_REQUIRED");
    });
    it("a journey worker cannot resend an existing processing effect after an expired parent lease", async () => {
        const j = await journeyFixture(); await j.deliveries.reserveEmail(automationCronActor(), { profileId: "t14d-member", journeyStateId: null, template: "welcome", subject: "Synthetic", idempotencyKey: j.key, locale: "en", classification: "transactional" });
        await runJourneyBatch(j.deps, { now: j.instant, limit: 1 });
        expect(j.send).not.toHaveBeenCalled();
        expect((await f.pool.query("SELECT status,error_code FROM journey_state WHERE delivery_key=$1", [j.key])).rows).toEqual([{ status: "failed", error_code: "provider_acceptance_uncertain" }]);
        const parent=(await f.pool.query("SELECT id FROM journey_state WHERE delivery_key=$1",[j.key])).rows[0];await expect(j.journeys.retryFailed(staff,parent.id,new Date())).rejects.toThrow("DELIVERY_RECONCILIATION_REQUIRED");
    });
    it("journey email unsubscribe committed during reservation blocks the pending marketing send", async () => {
        const j = await journeyFixture("day1_video");
        j.deps = { ...j.deps, deliveries: { ...j.deliveries, reserveEmail: async (a, x) => { const r = await j.deliveries.reserveEmail(a, x); await f.pool.query("INSERT INTO message_suppressions(profile_id,channel,classification) VALUES('t14d-member','email','marketing')"); return r; } } };
        await runJourneyBatch(j.deps, { now: j.instant, limit: 1 });
        expect(j.send).not.toHaveBeenCalled();
        expect((await f.pool.query("SELECT status FROM journey_state WHERE delivery_key=$1", [j.key])).rows).toEqual([{ status: "skipped" }]);
    });
    it.each(["retryable_network", "retryable_server", "admin_retry_retryable_network", "admin_retry_retryable_server", "provider_unclassified_failure"])("raw or legacy-authorized unknown delivery %s cannot bypass repository reconciliation", async error => {
        await seed(); const key = "legacy:t14d:" + randomUUID(); const id = (await f.pool.query("INSERT INTO email_log(profile_id,template,subject,status,idempotency_key,locale,classification,error_code,attempt_count) VALUES('t14d-member','welcome','Synthetic','failed',$1,'en','transactional',$2,1) RETURNING id", [key,error])).rows[0].id;
        await expect(createDeliveriesRepository(async () => f.database).retryEmailFailure(automationCronActor(), id, error)).rejects.toThrow("INVALID_DELIVERY_RETRY");
        expect((await f.pool.query("SELECT status,attempt_count FROM email_log WHERE id=$1", [id])).rows).toEqual([{status:"failed",attempt_count:1}]);
    });

    async function campaignFixture() {
        await seed(); const segment=randomUUID(), campaign=randomUUID(), recipient=randomUUID(), instant=new Date(Date.now()+1000);
        await f.pool.query("INSERT INTO saved_segments(id,owner_profile_id,name_en,filter_version,filters) VALUES($1,'t14d-staff','Synthetic',1,'{}')",[segment]);
        await f.pool.query("INSERT INTO campaigns(id,segment_id,created_by_profile_id,template,locale_strategy,status,idempotency_key) VALUES($1,$2,'t14d-staff','renewal-reminder','profile','draft',$3)",[campaign,segment,'t14d:'+campaign]);
        await f.pool.query("INSERT INTO campaign_recipients(id,campaign_id,profile_id,email,locale,variables) VALUES($1,$2,'t14d-member','member@example.test','en',$3::jsonb)",[recipient,campaign,JSON.stringify({displayName:'Synthetic Member',ctaUrl:'https://preview.example.test/portal'})]);
        await f.pool.query("INSERT INTO profiles(id,auth_user_id,display_name,role,email) VALUES('t14d-reviewer','t14d-reviewer-auth','Synthetic second reviewer','staff','reviewer@example.test')");
        const reviewer={kind:'staff',profileId:'t14d-reviewer',userId:'t14d-reviewer-auth'} as const, repository=createCampaignsRepository(async()=>f.database as unknown as Database);
        await repository.transaction(staff,store=>repository.submitForReview(staff,store,campaign));
        const snapshot=await repository.transaction(reviewer,store=>repository.campaignFor(reviewer,store,campaign));
        await repository.transaction(reviewer,store=>repository.recordReview(reviewer,store,campaign,{outcome:'approved'},snapshot?.reviewRevision));
        await repository.transaction(reviewer,store=>repository.queueApproved(reviewer,store,campaign));
        const key='campaign:'+campaign+':'+recipient+':email', send=vi.fn(async()=>({status:'sent' as const,providerId:'email.synthetic.'+randomUUID()}));
        const deliveries=createDeliveriesRepository(async()=>f.database);
        const deps:CampaignRunnerDependencies={campaigns:createCampaignRecipientDeliveryRepository(async()=>f.database),deliveries,staffTasks:createStaffTasksRepository(async()=>f.database),loadContext:async()=>{const row=(await f.pool.query("SELECT consent_marketing,(SELECT count(*)>0 FROM message_suppressions WHERE profile_id=profiles.id AND channel='email') AS suppressed FROM profiles WHERE id='t14d-member'")).rows[0];return{marketingConsent:row.consent_marketing,emailSuppressed:row.suppressed,unsubscribeUrl:'https://preview.example.test/unsubscribe',unsubscribeOneClickUrl:'https://preview.example.test/api/unsubscribe'};},renderCampaign:createCampaignEmailRenderer('https://preview.example.test/portal'),emailTransport:{send},emailFrom:'Synthetic <test@example.test>'};
        return{deps,deliveries,instant,key,recipient,send};
    }
    it.each(['retryable_network','retryable_server'] as const)('email campaign provider %s never retries an unknown external effect',async code=>{
        const c=await campaignFixture();c.send.mockRejectedValue(new DeliveryFailure(code));
        await runCampaignBatch(c.deps,{now:c.instant,limit:1});await runCampaignBatch(c.deps,{now:new Date(c.instant.getTime()+6*60000),limit:1});
        expect(c.send).toHaveBeenCalledTimes(1);
        expect((await f.pool.query('SELECT status,error_code,attempt_count FROM email_log WHERE idempotency_key=$1',[c.key])).rows).toEqual([{status:'failed',error_code:'provider_acceptance_uncertain',attempt_count:1}]);
        expect((await f.pool.query('SELECT status AS recipient_status,error_code FROM campaign_recipients WHERE id=$1',[c.recipient])).rows).toEqual([{recipient_status:'failed',error_code:'provider_acceptance_uncertain'}]);
    });
    it('email campaign unsubscribe during reservation prevents provider send and records suppression',async()=>{
        const c=await campaignFixture();c.deps={...c.deps,deliveries:{...c.deliveries,reserveEmail:async(a,x)=>{const r=await c.deliveries.reserveEmail(a,x);await f.pool.query("INSERT INTO message_suppressions(profile_id,channel,classification) VALUES('t14d-member','email','marketing')");return r;}}};
        expect(await runCampaignBatch(c.deps,{now:c.instant,limit:1})).toMatchObject({skipped:1,sent:0});expect(c.send).not.toHaveBeenCalled();
        expect((await f.pool.query('SELECT status AS recipient_status FROM campaign_recipients WHERE id=$1',[c.recipient])).rows).toEqual([{recipient_status:'suppressed'}]);
    });
    it('a definite journey 429 can retry the original durable effect once',async()=>{
        const j=await journeyFixture();j.send.mockRejectedValueOnce(new DeliveryFailure('retryable_rate_limit'));
        expect(await runJourneyBatch(j.deps,{now:j.instant,limit:1})).toMatchObject({retried:1});
        expect(await runJourneyBatch(j.deps,{now:new Date(j.instant.getTime()+6*60000),limit:1})).toMatchObject({sent:1});
        expect(j.send).toHaveBeenCalledTimes(2);expect(new Set(j.send.mock.calls.map(args=>(args as unknown as [{idempotencyKey:string}])[0].idempotencyKey)).size).toBe(1);
        expect((await f.pool.query('SELECT status,attempt_count FROM email_log WHERE idempotency_key=$1',[j.key])).rows).toEqual([{status:'sent',attempt_count:2}]);
    });


    it('journey facts changed after reservation cannot send the stale rendered body',async()=>{
        const j=await journeyFixture();const load=j.deps.loadContext;let reads=0;
        const deps={...j.deps,loadContext:async(...args:Parameters<typeof load>)=>{const c=await load(...args);return ++reads>1?{...c,variables:{...c.variables,ctaUrl:'https://preview.example.test/new-authoritative-link'}}:c;}};
        await runJourneyBatch(deps,{now:j.instant,limit:1});
        expect(j.send).not.toHaveBeenCalled();
        expect((await f.pool.query('SELECT status,error_code FROM email_log WHERE idempotency_key=$1',[j.key])).rows).toEqual([{status:'failed',error_code:'pre_send_blocked'}]);
    });

    async function passFixture() {
        await seed();const event=randomUUID(),order=randomUUID(),seat=randomUUID();
        await f.pool.query("INSERT INTO events(id,slug,title_en,title_zh,description_en,starts_at,published,status,registration_mode,ticket_price_hkd_cents) VALUES($1,$2,'Synthetic','合成','Synthetic',now()+interval '1 year',true,'published','ticketed',1000)",[event,'t14d-'+event]);
        await f.pool.query("INSERT INTO event_orders(id,event_id,buyer_name,buyer_email,buyer_locale,amount_hkd_cents,status,paid_at,idempotency_key,expires_at) VALUES($1,$2,'Synthetic','buyer@example.test','en',1000,'paid',now(),$3,now()+interval '1 day')",[order,event,'t14d-'+order]);
        await f.pool.query("INSERT INTO event_order_seats(id,order_id,position,attendee_name,attendee_email) VALUES($1,$2,0,'Synthetic','seat@example.test')",[seat,order]);
        const request=batchRequestSchema.parse({operation:'ticket_resend',idempotencyKey:randomUUID(),targetSeatIds:[seat],payload:{}});
        const unresolved=()=>f.pool.query("INSERT INTO ticket_email_outbox(order_id,seat_id,kind,event_key,status,error_code) VALUES($1,$2,'pass',$3,'uncertain','provider_acceptance_uncertain')",[order,seat,'t14d-unknown-'+seat]);
        return{event,order,seat,request,unresolved};
    }
    it('batch pass preview blocks a pre-existing unknown provider effect',async()=>{
        const o=await passFixture();await o.unresolved();
        const items=await f.database.transaction(tx=>ticketResendBatchHandler.prepare(staff,o.request,tx));
        expect(items[0]).toMatchObject({eligible:false,previewStatus:'blocked',reasonCode:'DELIVERY_RECONCILIATION_REQUIRED'});
    });
    it('batch execution rechecks an effect that becomes unknown after its eligible preview',async()=>{
        vi.stubEnv('TICKET_RESEND_BATCH_ENABLED','true');
        try {
            const o=await passFixture();const items=await f.database.transaction(tx=>ticketResendBatchHandler.prepare(staff,o.request,tx));expect(items[0].eligible).toBe(true);await o.unresolved();
            const claim={itemId:randomUUID(),batchId:randomUUID(),operation:'ticket_resend' as const,actorProfileId:staff.profileId,request:o.request,target:items[0].target,expectedVersion:items[0].expectedVersion,effectKey:randomUUID(),attemptCount:1,leaseOwner:'synthetic',leaseToken:1};
            const result=await f.database.transaction(tx=>ticketResendBatchHandler.execute(staff,claim,tx));
            expect(result).toMatchObject({status:'skipped',reasonCode:'DELIVERY_RECONCILIATION_REQUIRED'});
            expect((await f.pool.query('SELECT count(*)::int AS n FROM ticket_email_outbox WHERE seat_id=$1',[o.seat])).rows).toEqual([{n:1}]);
        } finally {vi.unstubAllEnvs();}
    });

    function manualPorts() {
        // The disposable node-postgres driver executes the same Drizzle transaction contract.
        const outbox = createTicketEmailOutboxRepository(async () => f.database as unknown as Database);
        const send = vi.fn(async () => ({status: 'sent' as const, providerId: 'email.synthetic.' + randomUUID()}));
        return {outbox, send, runner: () => ({outbox, orders: eventOrdersRepository, renderEmail, transport: {send}, refundVerified: async () => false, emailFrom: 'Synthetic <test@example.test>', appUrl: 'https://preview.example.test', passSecret: 'isolated-synthetic-pass-secret-32'})};
    }
    it('manual resend cannot use a fresh intent to bypass unknown pass effects', async () => {
        const o = await passFixture(); await o.unresolved(); const d = manualPorts();
        expect(await resendStaffPass(staff, o.seat, randomUUID(), d)).toMatchObject({status: 'uncertain'});
        expect(await resendStaffPass(staff, o.seat, randomUUID(), d)).toMatchObject({status: 'uncertain'});
        expect(d.send).not.toHaveBeenCalled();
        expect((await f.pool.query('SELECT count(*)::int AS n FROM ticket_email_outbox WHERE seat_id=$1', [o.seat])).rows).toEqual([{n: 1}]);
    });
    it('manual resend uses actual paid-seat repository and one stable attempt; a later legitimate intent sends again', async () => {
        const o = await passFixture(), d = manualPorts(), intent = randomUUID();
        // Preserve the established single-seat rule, distinct from stricter bulk eligibility.
        await f.pool.query("UPDATE events SET starts_at=now()-interval '1 day' WHERE id=$1", [o.event]);
        await f.pool.query('UPDATE event_order_seats SET checked_in_at=now() WHERE id=$1', [o.seat]);
        expect(await resendStaffPass(staff, o.seat, intent, d)).toMatchObject({status: 'sent'});
        expect(await resendStaffPass(staff, o.seat, intent, d)).toMatchObject({status: 'sent'}); expect(d.send).toHaveBeenCalledTimes(1);
        expect(await resendStaffPass(staff, o.seat, randomUUID(), d)).toMatchObject({status: 'sent'}); expect(d.send).toHaveBeenCalledTimes(2);
        expect((await f.pool.query("SELECT count(*)::int AS n FROM audit_events WHERE target_id=$1 AND action='ticket.pass.resend_queued'", [o.seat])).rows).toEqual([{n: 2}]);
        expect((await f.pool.query('SELECT status,provider_id FROM ticket_email_outbox WHERE seat_id=$1', [o.seat])).rows.every(x => x.status === 'sent' && x.provider_id.startsWith('email.synthetic.'))).toBe(true);
    });
    it('manual network acceptance-timeout holds the existing effect rather than promising a safe new resend', async () => {
        const o = await passFixture(), d = manualPorts(), intent = randomUUID(); d.send.mockRejectedValue(new DeliveryFailure('retryable_network'));
        expect(await resendStaffPass(staff, o.seat, intent, d)).toMatchObject({status: 'uncertain'});
        expect(await resendStaffPass(staff, o.seat, intent, d)).toMatchObject({status: 'uncertain'});
        expect(await resendStaffPass(staff, o.seat, randomUUID(), d)).toMatchObject({status: 'uncertain'}); expect(d.send).toHaveBeenCalledTimes(1);
    });
    it('manual pass order refunded during render is rechecked before the provider request', async () => {
        const o = await passFixture(), d = manualPorts(); const runner = d.runner;
        const deps = {...d, runner: () => ({...runner(), renderEmail: async (...args: Parameters<typeof renderEmail>) => {
            const rendered = await renderEmail(...args); await f.pool.query("UPDATE event_orders SET status='refunded' WHERE id=$1", [o.order]); return rendered;
        }})};
        expect(await resendStaffPass(staff, o.seat, randomUUID(), deps)).toMatchObject({status: 'blocked'});
        expect(d.send).not.toHaveBeenCalled();
        expect((await f.pool.query('SELECT status,error_code FROM ticket_email_outbox WHERE seat_id=$1', [o.seat])).rows).toEqual([{status: 'suppressed', error_code: 'order_state_changed'}]);
    });
    it('concurrent manual intents serialize before queueing; pending does not become a false sent result', async () => {
        const o = await passFixture(), d = manualPorts();
        const notices = await Promise.all([d.outbox.queueStaffPass(staff, o.seat, randomUUID()), d.outbox.queueStaffPass(staff, o.seat, randomUUID())]);
        expect(notices.map(x => x?.status).sort()).toEqual(['pending', 'queued']);
        expect((await f.pool.query('SELECT count(*)::int AS n FROM ticket_email_outbox WHERE seat_id=$1', [o.seat])).rows).toEqual([{n: 1}]);
    });
    it('member cannot queue or inspect a staff resend; revoked order produces no notice', async () => {
        const o = await passFixture(), d = manualPorts(), intent = randomUUID();
        await expect(d.outbox.queueStaffPass(member, o.seat, intent)).rejects.toThrow('FORBIDDEN');
        await expect(d.outbox.staffPassStatus(member, o.seat, intent)).rejects.toThrow('FORBIDDEN');
        await expect(resendStaffPass(member, o.seat, intent, d)).rejects.toThrow('FORBIDDEN');
        await f.pool.query("UPDATE event_orders SET status='refunded' WHERE id=$1", [o.order]);
        expect(await resendStaffPass(staff, o.seat, intent, d)).toBeNull(); expect(d.send).not.toHaveBeenCalled();
        expect((await f.pool.query('SELECT count(*)::int AS n FROM ticket_email_outbox WHERE seat_id=$1', [o.seat])).rows).toEqual([{n: 0}]);
    });

    async function outboxFixture(lane:'ticket'|'lead') {
        await seed();const entity=randomUUID(), id=randomUUID(), key='outbox:t14d:'+id, instant=new Date(Date.now()+1000);
        if(lane==='ticket') {
            const event=randomUUID();await f.pool.query("INSERT INTO events(id,slug,title_en,title_zh,description_en,starts_at) VALUES($1,$2,'Synthetic','合成','Synthetic',now()+interval '1 year')",[event,'t14d-'+event]);
            await f.pool.query("INSERT INTO event_orders(id,event_id,buyer_name,buyer_email,buyer_locale,amount_hkd_cents,idempotency_key,expires_at) VALUES($1,$2,'Synthetic','buyer@example.test','en',1000,$3,now()+interval '1 day')",[entity,event,key]);
            await f.pool.query("INSERT INTO ticket_email_outbox(id,order_id,kind,event_key,next_attempt_at) VALUES($1,$2,'confirmation',$3,now()-interval '1 minute')",[id,entity,key]);
        } else {
            const company=randomUUID(),listing=randomUUID();await f.pool.query("INSERT INTO companies(id,legal_name,display_name) VALUES($1,'Synthetic','Synthetic')",[company]);
            await f.pool.query("INSERT INTO showcase_listings(id,company_id,slug,member_since,name_en,name_zh_hk,tagline_en,tagline_zh_hk,description_en,description_zh_hk,category) VALUES($1,$2,$3,'2020-01-01','Synthetic','合成','Synthetic','合成','Synthetic','合成','Synthetic')",[listing,company,'t14d-'+listing]);
            await f.pool.query("INSERT INTO leads(id,listing_id,contact_name,email,idempotency_key) VALUES($1,$2,'Synthetic','lead@example.test',$3)",[entity,listing,key]);
            await f.pool.query("INSERT INTO showcase_lead_email_outbox(id,lead_id,kind,idempotency_key,next_attempt_at) VALUES($1,$2,'ack',$3,now()-interval '1 minute')",[id,entity,key]);
        }
        const ticket=createTicketEmailOutboxRepository(async()=>f.database as unknown as Database),lead=createShowcaseLeadEmailOutboxRepository(async()=>f.database as unknown as Database);
        const claims=lane==='ticket'?await ticket.claimForOrder(entity,instant):await lead.claimDue(automationCronActor(),instant,1);expect(claims).toHaveLength(1);const n=claims[0].attemptCount;
        const payload={to:'recipient@example.test',from:'test@example.test',subject:'Synthetic',html:'<p>Synthetic</p>',text:'Synthetic',headers:{},idempotencyKey:key};
        expect(lane==='ticket'?await ticket.freezePayload(id,n,payload,instant):await lead.freezePayload(automationCronActor(),id,n,payload,instant)).toBe(true);
        const query=()=>f.pool.query('SELECT status,error_code,attempt_count FROM '+(lane==='ticket'?'ticket_email_outbox':'showcase_lead_email_outbox')+' WHERE id=$1',[id]);
        const retry=(code:string)=>lane==='ticket'?ticket.markRetryable(id,n,instant,code):lead.markRetryable(automationCronActor(),id,n,instant,code);
        const reclaim=()=>lane==='ticket'?ticket.claimForOrder(entity,new Date(instant.getTime()+20*60000)):lead.claimDue(automationCronActor(),new Date(instant.getTime()+20*60000),1);
        return{id,n,query,retry,reclaim};
    }
    for(const lane of ['ticket','lead'] as const) {
        it.each(['retryable_network','retryable_server','delivery_unknown'])('%s '+lane+' outbox effect becomes uncertain immediately rather than being blindly reissued inside provider TTL',async code=>{
            const o=await outboxFixture(lane);expect(await o.retry(code)).toBe(true);expect((await o.query()).rows).toEqual([{status:'uncertain',error_code:'provider_acceptance_uncertain',attempt_count:1}]);expect(await o.reclaim()).toEqual([]);
            expect(Number((await f.pool.query("SELECT count(*) AS n FROM staff_tasks WHERE summary_code LIKE '%uncertain' AND dedupe_key LIKE $1",['%'+o.id])).rows[0].n)).toBe(1);
        });
        it(lane+' outbox worker restart after a frozen payload cannot adopt an expired send lease',async()=>{
            const o=await outboxFixture(lane);expect(await o.reclaim()).toEqual([]);expect((await o.query()).rows[0]).toMatchObject({status:'uncertain',error_code:'provider_acceptance_uncertain',attempt_count:1});
        });
        it(lane+' outbox definite 429 retains its original durable key and retry lease',async()=>{
            const o=await outboxFixture(lane);expect(await o.retry('retryable_rate_limit')).toBe(true);const next=await o.reclaim();expect(next).toHaveLength(1);expect(next[0]).toMatchObject({id:o.id,attemptCount:2});
        });
    }

});

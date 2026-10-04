import {it,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {inboxDraftScope,protectInboxDraft,restoreInboxDraft,inboxDraftProtectionConfigured} from "@/lib/admin/inbox-draft-protection";
const secret="dedicated-synthetic-draft-key-"+"x".repeat(32),at=Date.now();
const binding={scope:inboxDraftScope('staff','auth','session-a'),conversationId:randomUUID()};
const draft={content:'Synthetic private other@example.test +85290000001 payment fragment',attemptId:randomUUID()};
it('does not reuse the Auth or Concierge secret for draft retention',()=>{
 expect(inboxDraftProtectionConfigured({INBOX_DRAFT_PROTECTION_ENABLED:"true",INBOX_DRAFT_ENCRYPTION_SECRET:secret,NEON_AUTH_COOKIE_SECRET:secret})).toBe(false);
 expect(inboxDraftProtectionConfigured({INBOX_DRAFT_PROTECTION_ENABLED:"true",INBOX_DRAFT_ENCRYPTION_SECRET:secret,CONCIERGE_COOKIE_SECRET:secret})).toBe(false);
});
it('opaque protection round-trips only the original session and conversation',()=>{
 const blob=protectInboxDraft(binding,draft,secret,at);expect(blob).not.toContain('example.test');expect(blob).not.toContain(draft.content);
 expect(restoreInboxDraft(binding,blob,secret,at+1000)).toEqual(draft);
 for(const b of [{...binding,conversationId:randomUUID()},{...binding,scope:inboxDraftScope('other','auth-other','session-a')},{...binding,scope:inboxDraftScope('staff','auth','session-b')}])expect(restoreInboxDraft(b,blob,secret,at+1000)).toBeNull();
});
it('expired, tampered or wrong-key protected text never restores',()=>{
 const blob=protectInboxDraft(binding,draft,secret,at);
 expect(restoreInboxDraft(binding,blob,secret,at+60*60*1000)).toBeNull();
 expect(restoreInboxDraft(binding,blob+'junk',secret,at+1)).toBeNull();
 expect(restoreInboxDraft(binding,blob,secret+'wrong',at+1)).toBeNull();
});
it('missing dedicated configuration leaves only in-memory typing',()=>{expect(inboxDraftProtectionConfigured({})).toBe(false);expect(inboxDraftProtectionConfigured({INBOX_DRAFT_ENCRYPTION_SECRET:'short'})).toBe(false);});

it("a dedicated key alone does not activate private browser retention",()=>{expect(inboxDraftProtectionConfigured({INBOX_DRAFT_ENCRYPTION_SECRET:"s".repeat(32)})).toBe(false);});

it('retention duration is bounded and configurable',()=>{expect(inboxDraftProtectionConfigured({INBOX_DRAFT_PROTECTION_ENABLED:'true',INBOX_DRAFT_ENCRYPTION_SECRET:secret,INBOX_DRAFT_RETENTION_SECONDS:'60'})).toBe(true);expect(inboxDraftProtectionConfigured({INBOX_DRAFT_PROTECTION_ENABLED:'true',INBOX_DRAFT_ENCRYPTION_SECRET:secret,INBOX_DRAFT_RETENTION_SECONDS:'3601'})).toBe(false);const blob=protectInboxDraft(binding,draft,secret,at,60000);expect(restoreInboxDraft(binding,blob,secret,at+60000)).toBeNull();});

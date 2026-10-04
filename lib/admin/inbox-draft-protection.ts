import "server-only";
import {createHash,randomBytes,createCipheriv,createDecipheriv} from "node:crypto";
import {z} from "zod";
const draftSchema=z.object({content:z.string().max(4096),attemptId:z.string().uuid()}).strict();
export type PrivateInboxDraft=z.infer<typeof draftSchema>;
export type InboxDraftBinding=Readonly<{scope:string;conversationId:string}>;
export function inboxDraftScope(profileId:string,userId:string,sessionId:string){
 if(!profileId||!userId||!sessionId)throw Error('INBOX_DRAFT_SESSION_REQUIRED');
 return createHash('sha256').update(JSON.stringify(['inbox-draft-v1',profileId,userId,sessionId])).digest('hex');
}
export function inboxDraftRetentionMs(env:Readonly<Partial<NodeJS.ProcessEnv>>=process.env){const raw=env.INBOX_DRAFT_RETENTION_SECONDS??"3600";if(!/^[0-9]+$/.test(raw))return null;const seconds=Number(raw);return Number.isInteger(seconds)&&seconds>=60&&seconds<=3600?seconds*1000:null;}
export function inboxDraftProtectionConfigured(env:Readonly<Partial<NodeJS.ProcessEnv>>=process.env){return env.INBOX_DRAFT_PROTECTION_ENABLED==='true'&&inboxDraftRetentionMs(env)!==null&&typeof env.INBOX_DRAFT_ENCRYPTION_SECRET==='string'&&env.INBOX_DRAFT_ENCRYPTION_SECRET.trim().length>=32&&env.INBOX_DRAFT_ENCRYPTION_SECRET!==env.NEON_AUTH_COOKIE_SECRET&&env.INBOX_DRAFT_ENCRYPTION_SECRET!==env.CONCIERGE_COOKIE_SECRET;}
function binding(value:InboxDraftBinding){return z.object({scope:z.string().regex(/^[a-f0-9]{64}$/),conversationId:z.string().uuid()}).strict().parse(value);}
function key(secret:string){if(secret.trim().length<32)throw Error('INBOX_DRAFT_PROTECTION_DISABLED');return createHash('sha256').update(secret).digest();}
/** Dedicated key; never reuse Auth/Concierge secrets. Only opaque ciphertext is stored in the browser. */
export function protectInboxDraft(scope:InboxDraftBinding,input:unknown,secret:string,now=Date.now(),retentionMs=60*60*1000){
 if(!Number.isInteger(retentionMs)||retentionMs<60000||retentionMs>3600000)throw Error("INBOX_DRAFT_RETENTION_INVALID");
 const value=draftSchema.parse(input),bound=binding(scope),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);
 cipher.setAAD(Buffer.from(JSON.stringify(bound)));
 // Engineering retention ceiling only. Enabling this private retention requires its configuration gate.
 const body=JSON.stringify({v:1,...value,...bound,expiresAt:now+retentionMs});
 const encrypted=Buffer.concat([cipher.update(body,'utf8'),cipher.final()]);
 return ['1',iv.toString('base64url'),encrypted.toString('base64url'),cipher.getAuthTag().toString('base64url')].join('.');
}
export function restoreInboxDraft(scope:InboxDraftBinding,envelope:string,secret:string,now=Date.now()):PrivateInboxDraft|null{
 try{
  const bound=binding(scope);if(envelope.length>12000)return null;
  const [v,iv,content,tag,...extra]=envelope.split('.');if(v!=='1'||!iv||!content||!tag||extra.length)return null;
  const decipher=createDecipheriv('aes-256-gcm',key(secret),Buffer.from(iv,'base64url'));
  decipher.setAAD(Buffer.from(JSON.stringify(bound)));decipher.setAuthTag(Buffer.from(tag,'base64url'));
  const parsed=z.object({v:z.literal(1),...draftSchema.shape,scope:z.string(),conversationId:z.string(),expiresAt:z.number().int()}).strict().parse(JSON.parse(Buffer.concat([decipher.update(Buffer.from(content,'base64url')),decipher.final()]).toString('utf8')));
  if(parsed.scope!==bound.scope||parsed.conversationId!==bound.conversationId||parsed.expiresAt<=now||parsed.expiresAt>now+60*60*1000)return null;
  return draftSchema.parse({content:parsed.content,attemptId:parsed.attemptId});
 }catch{return null;}
}

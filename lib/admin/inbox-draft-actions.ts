"use server";
import {requireAdminActor} from "@/lib/auth/actor";
import {getSession} from "@/lib/auth/server";
import {z} from "zod";
import {inboxDraftScope,inboxDraftRetentionMs,inboxDraftProtectionConfigured,protectInboxDraft,restoreInboxDraft} from "./inbox-draft-protection";
export async function protectInboxDraftAction(conversationId:string,input:unknown){
 try{const actor=await requireAdminActor(),session=await getSession();if(!session||session.user.id!==actor.userId)return {status:'unavailable' as const};
 if(!inboxDraftProtectionConfigured())return {status:'disabled' as const};
 const scope=inboxDraftScope(actor.profileId,actor.userId,session.session.id);
 const envelope=protectInboxDraft({scope,conversationId:z.string().uuid().parse(conversationId)},input,process.env.INBOX_DRAFT_ENCRYPTION_SECRET!,Date.now(),inboxDraftRetentionMs()!);
 return {status:'protected' as const,envelope};}catch{return {status:'unavailable' as const};}
}
export async function restoreInboxDraftAction(conversationId:string,envelope:string){
 try{const actor=await requireAdminActor(),session=await getSession();if(!session||session.user.id!==actor.userId)return {status:'unavailable' as const};
 if(!inboxDraftProtectionConfigured())return {status:'disabled' as const};
 const scope=inboxDraftScope(actor.profileId,actor.userId,session.session.id);
 const draft=restoreInboxDraft({scope,conversationId:z.string().uuid().parse(conversationId)},envelope,process.env.INBOX_DRAFT_ENCRYPTION_SECRET!);
 return draft?{status:'restored' as const,draft}:{status:'missing' as const};}catch{return {status:'unavailable' as const};}
}

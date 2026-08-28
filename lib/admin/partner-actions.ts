"use server";
import {notFound} from "next/navigation";
import {runPartnerFormAction, type PartnerActionState} from "@/lib/admin/partner-action-core";
import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {requireAdminActor} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {createPartner, setPartnerArchived, setPartnerPublished, updatePartner} from "@/lib/db/repos/partners";

export type PartnerActionMessages = Readonly<{successMessage: string; validationMessage: string; errorMessage: string}>;
export type PartnerLifecycleState = Readonly<{status: "idle" | "success" | "invalid" | "error"}>;

async function actor() { try { return await requireAdminActor(); } catch (error) { if (isAuthorizationDenial(error)) notFound(); throw error; } }
async function boundary<T>(work: (value: Awaited<ReturnType<typeof requireAdminActor>>) => Promise<T>): Promise<T> { return work(await actor()); }
function lifecycleInvalid(error: unknown): boolean { return error instanceof Error && (error.message === "PARTNER_LIFECYCLE_INVALID" || error.message === "PARTNER_PUBLICATION_NOT_READY" || error.message === "PARTNER_LOGO_CHANGED_RETRY"); }

export async function createPartnerAction(path: string, messages: PartnerActionMessages, state: PartnerActionState, data: FormData) { return boundary((value) => runPartnerFormAction(state, data, {...messages, mutate: async (input) => { await createPartner(value, input); revalidateAdminPath(path); }})); }
export async function updatePartnerAction(id: string, path: string, messages: PartnerActionMessages, state: PartnerActionState, data: FormData) { return boundary((value) => runPartnerFormAction(state, data, {...messages, mutate: async (input) => { if (!await updatePartner(value, id, input)) throw new Error("PARTNER_NOT_FOUND"); revalidateAdminPath(path); }})); }
export async function setPartnerPublishedAction(id: string, path: string, value: boolean, state: PartnerLifecycleState, data: FormData): Promise<PartnerLifecycleState> { void state; void data; const admin = await actor(); try { if (!await setPartnerPublished(admin, id, value)) return {status: "invalid"}; revalidateAdminPath(path); return {status: "success"}; } catch (error) { return {status: lifecycleInvalid(error) ? "invalid" : "error"}; } }
export async function setPartnerArchivedAction(id: string, path: string, value: boolean, state: PartnerLifecycleState, data: FormData): Promise<PartnerLifecycleState> { void state; void data; const admin = await actor(); try { if (!await setPartnerArchived(admin, id, value)) return {status: "invalid"}; revalidateAdminPath(path); return {status: "success"}; } catch (error) { return {status: lifecycleInvalid(error) ? "invalid" : "error"}; } }

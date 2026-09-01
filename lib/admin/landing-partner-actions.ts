"use server";
import {notFound} from "next/navigation";
import {runLandingPartnerFormAction} from "@/lib/admin/landing-partner-action-core";
import type {PartnerActionMessages, PartnerLifecycleState} from "@/lib/admin/partner-actions";
import type {PartnerActionState} from "@/lib/admin/partner-action-core";
import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {revalidatePublicRoute} from "@/lib/admin/revalidate-public-path";
import {requireAdminActor} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {createLandingPartner, setLandingPartnerArchived, setLandingPartnerPublished, updateLandingPartner} from "@/lib/db/repos/landing-partners";

async function actor() { try { return await requireAdminActor(); } catch (error) { if (isAuthorizationDenial(error)) notFound(); throw error; } }
async function boundary<T>(work: (value: Awaited<ReturnType<typeof requireAdminActor>>) => Promise<T>): Promise<T> { return work(await actor()); }
const refresh = (path: string) => { revalidateAdminPath(path); revalidatePublicRoute("/launchpad"); };
function lifecycleInvalid(error: unknown): boolean { return error instanceof Error && (error.message === "LANDING_PARTNER_LIFECYCLE_INVALID" || error.message === "LANDING_PARTNER_PUBLICATION_NOT_READY"); }

export async function createLandingPartnerAction(path: string, messages: PartnerActionMessages, state: PartnerActionState, data: FormData) { return boundary((value) => runLandingPartnerFormAction(state, data, {...messages, mutate: async (input) => { await createLandingPartner(value, input); refresh(path); }})); }
export async function updateLandingPartnerAction(id: string, path: string, messages: PartnerActionMessages, state: PartnerActionState, data: FormData) { return boundary((value) => runLandingPartnerFormAction(state, data, {...messages, mutate: async (input) => { if (!await updateLandingPartner(value, id, input)) throw new Error("LANDING_PARTNER_NOT_FOUND"); refresh(path); }})); }
export async function setLandingPartnerPublishedAction(id: string, path: string, value: boolean, state: PartnerLifecycleState, data: FormData): Promise<PartnerLifecycleState> { void state; void data; const admin = await actor(); try { if (!await setLandingPartnerPublished(admin, id, value)) return {status: "invalid"}; refresh(path); return {status: "success"}; } catch (error) { return {status: lifecycleInvalid(error) ? "invalid" : "error"}; } }
export async function setLandingPartnerArchivedAction(id: string, path: string, value: boolean, state: PartnerLifecycleState, data: FormData): Promise<PartnerLifecycleState> { void state; void data; const admin = await actor(); try { if (!await setLandingPartnerArchived(admin, id, value)) return {status: "invalid"}; refresh(path); return {status: "success"}; } catch (error) { return {status: lifecycleInvalid(error) ? "invalid" : "error"}; } }

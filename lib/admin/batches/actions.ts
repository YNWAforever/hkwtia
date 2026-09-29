"use server";

import {revalidatePath} from "next/cache";
import {notFound} from "next/navigation";

import {prepareBatch, commitBatch, retryFailedBatchItems, retryFailedBatchItem, cancelPendingBatchItems} from "@/lib/admin/batches/service";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {requireAdminActor} from "@/lib/auth/actor";
import type {BatchTarget} from "@/lib/admin/batches/types";

export async function prepareAdminBatchAction(input: unknown): Promise<{batchId: string}> {
  try {return await prepareBatch(await requireAdminActor(), input);}
  catch (error) {if (isAuthorizationDenial(error)) notFound(); throw error;}
}
export async function commitAdminBatchAction(batchId: string, previewDigest: string): Promise<void> {
  try {await commitBatch(await requireAdminActor(), {batchId, previewDigest}); revalidatePath(`/admin/batches/${batchId}`);}
  catch (error) {if (isAuthorizationDenial(error)) notFound(); throw error;}
}
export async function retryAdminBatchAction(batchId: string): Promise<void> {
  try {await retryFailedBatchItems(await requireAdminActor(), batchId); revalidatePath(`/admin/batches/${batchId}`);}
  catch (error) {if (isAuthorizationDenial(error)) notFound(); throw error;}
}
export async function retryAdminBatchItemAction(batchId: string, target: BatchTarget): Promise<void> {
  try {await retryFailedBatchItem(await requireAdminActor(), batchId, target); revalidatePath(`/admin/batches/${batchId}`);}
  catch (error) {if (isAuthorizationDenial(error)) notFound(); throw error;}
}
export async function cancelAdminBatchAction(batchId: string): Promise<void> {
  try {await cancelPendingBatchItems(await requireAdminActor(), batchId); revalidatePath(`/admin/batches/${batchId}`);}
  catch (error) {if (isAuthorizationDenial(error)) notFound(); throw error;}
}

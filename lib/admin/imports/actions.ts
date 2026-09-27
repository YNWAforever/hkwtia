"use server";

import {notFound} from "next/navigation";
import {z} from "zod";

import {confirmMemberImport, validateMemberImport} from "@/lib/admin/imports/service";
import {memberImportRepository} from "@/lib/db/repos/member-imports";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {requireAdminActor} from "@/lib/auth/actor";

export async function validateMemberImportAction(input: unknown) {
  try {return await validateMemberImport(await requireAdminActor(), input);}
  catch (error) {if (isAuthorizationDenial(error)) notFound(); throw error;}
}
export async function readMemberImportRunAction(runId: unknown) {
  try {return await memberImportRepository.read(await requireAdminActor(), z.string().uuid().parse(runId));}
  catch (error) {if (isAuthorizationDenial(error)) notFound(); throw error;}
}
export async function confirmMemberImportAction(input: unknown) {
  try {return await confirmMemberImport(await requireAdminActor(), input);}
  catch (error) {if (isAuthorizationDenial(error)) notFound(); throw error;}
}

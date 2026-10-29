"use server";
import {getActor} from "@/lib/auth/actor";
import {createSupplementBinding} from "@/lib/membership/supplement-binding";
import type {SupplementResult} from "@/lib/membership/supplement-service";

export async function publishSupplement(input: unknown): Promise<SupplementResult> {
  if (process.env.HKWTIA_SUPPLEMENT_WRITES_ENABLED !== "true") return {status:"forbidden"};
  const actor = await getActor();
  if (!actor) return {status:"forbidden"};
  return createSupplementBinding({enabled:()=>process.env.HKWTIA_SUPPLEMENT_WRITES_ENABLED === "true",actor:async()=>actor}).publish(input);
}

export async function respondToSupplement(input: unknown): Promise<SupplementResult> {
  if (process.env.HKWTIA_SUPPLEMENT_WRITES_ENABLED !== "true") return {status:"forbidden"};
  const actor = await getActor();
  if (!actor) return {status:"forbidden"};
  return createSupplementBinding({enabled:()=>process.env.HKWTIA_SUPPLEMENT_WRITES_ENABLED === "true",actor:async()=>actor}).respond(input);
}

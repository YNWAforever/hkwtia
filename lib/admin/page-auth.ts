import "server-only";

import {notFound} from "next/navigation";

import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {requireAdminActor} from "@/lib/auth/actor";

export async function requireAdminPageActor() {
  try {
    return await requireAdminActor();
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

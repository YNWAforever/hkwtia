import "server-only";

import {getLocale} from "next-intl/server";
import {redirect} from "next/navigation";

import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {requireAdminActor} from "@/lib/auth/actor";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

export async function requireAdminPageActor() {
  try {
    return await requireAdminActor();
  } catch (error) {
    if (isAuthorizationDenial(error)) redirect(localizedPath(await getLocale() as AppLocale, "/admin-login"));
    throw error;
  }
}

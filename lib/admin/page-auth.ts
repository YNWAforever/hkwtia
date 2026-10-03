import "server-only";

import {getLocale} from "next-intl/server";
import {redirect} from "next/navigation";

import {allowedAdminDestination} from "@/lib/auth/login-destination";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {requireAdminActor} from "@/lib/auth/actor";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

export async function requireAdminPageActor(returnTo?: string) {
  try {
    return await requireAdminActor();
  } catch (error) {
    if (isAuthorizationDenial(error)) {
      const destination = allowedAdminDestination(returnTo);
      const query = destination ? `?${new URLSearchParams({next: destination})}` : "";
      redirect(localizedPath(await getLocale() as AppLocale, `/admin-login${query}`));
    }
    throw error;
  }
}

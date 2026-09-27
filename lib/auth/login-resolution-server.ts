import "server-only";

import {getSession} from "@/lib/auth/server";
import {profileIdentityRepository} from "@/lib/db/repos/profile-identities";
import type {LoginDestination} from "@/lib/auth/login-destination";
import {resolveLogin, type LoginResolution} from "@/lib/auth/login-resolution";

export async function resolveCurrentLogin(destination: LoginDestination): Promise<LoginResolution> {
  return resolveLogin(destination, {
    session: getSession,
    resolveProfile: (authUserId) => profileIdentityRepository.resolve(authUserId),
  });
}

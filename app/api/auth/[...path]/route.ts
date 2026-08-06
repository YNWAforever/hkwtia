import {rateLimitAuthRequest} from "@/lib/auth/rate-limit";
import {auth} from "@/lib/auth/server";

const handlers = auth.handler();

// Reads and redirects pass through untouched. Only POST can trigger an outbound
// email or a credential guess, and only the paths listed in
// lib/auth/rate-limit.ts are charged — everything else delegates unchanged.
export const {GET, PUT, DELETE, PATCH} = handlers;

export async function POST(
  request: Request,
  ...rest: readonly unknown[]
): Promise<Response> {
  const limited = await rateLimitAuthRequest(request);
  if (limited) return limited;
  return (handlers.POST as (...args: readonly unknown[]) => Promise<Response>)(request, ...rest);
}

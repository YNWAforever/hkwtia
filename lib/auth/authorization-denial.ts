import "server-only";

export function isAuthorizationDenial(error: unknown): boolean {
  return error instanceof Error && (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN");
}

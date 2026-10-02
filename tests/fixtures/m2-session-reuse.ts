import type {Cookie} from "@playwright/test";

type SessionPage = Readonly<{
  context: () => Readonly<{addCookies: (cookies: Cookie[]) => Promise<unknown>}>;
  request: Readonly<{get: (path: string) => Promise<Readonly<{ok: () => boolean; json: () => Promise<unknown>}>>}>;
}>;

export async function reuseM2Session(page: SessionPage, cookies: Cookie[], expectedEmail: string): Promise<boolean> {
  await page.context().addCookies(cookies);
  const response = await page.request.get("/api/auth/get-session");
  if (!response.ok()) return false;
  const body = await response.json();
  if (!body || typeof body !== "object" || !("user" in body)) return false;
  const user = body.user;
  return !!user && typeof user === "object" && "id" in user && typeof user.id === "string"
    && "email" in user && typeof user.email === "string"
    && user.email.toLowerCase() === expectedEmail.toLowerCase();
}

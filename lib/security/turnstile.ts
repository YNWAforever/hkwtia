type TurnstileOptions = Readonly<{
  secret?: string;
  token?: string;
  remoteIp?: string | null;
  fetchImpl?: typeof fetch;
}>;

export async function verifyTurnstile(
  options: TurnstileOptions,
): Promise<boolean> {
  if (options.secret === undefined) return true;
  const secret = options.secret.trim();
  if (!secret) return false;
  const token = options.token?.trim();
  if (!token || token.length > 4_096) return false;

  const body = new URLSearchParams({
    secret,
    response: token,
  });
  if (options.remoteIp) body.set("remoteip", options.remoteIp);

  try {
    const response = await (options.fetchImpl ?? fetch)(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {"content-type": "application/x-www-form-urlencoded"},
        body,
        cache: "no-store",
      },
    );
    if (!response.ok) return false;
    const value: unknown = await response.json();
    return Boolean(
      value
      && typeof value === "object"
      && "success" in value
      && value.success === true,
    );
  } catch {
    return false;
  }
}

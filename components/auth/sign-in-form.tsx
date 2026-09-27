"use client";

import {useEffect, useState} from "react";
import {useFormStatus} from "react-dom";

import type {AppLocale} from "@/i18n/routing";
import type {LoginIntent} from "@/lib/auth/login-destination";
import {authClient} from "@/lib/auth/client";
import {localizedPath} from "@/lib/urls";

type Labels = Readonly<{
  email: string; send: string; resend: string; sending: string; google: string;
  separator: string; changeEmail: string; sent: string; googleUnavailable: string;
  providerError: string; maskedTo: string; waitSeconds: string;
}>;
type Props = Readonly<{
  intent: LoginIntent; locale: AppLocale; destination: string;
  action: (formData: FormData) => Promise<void>;
  googleEnabled: boolean; sent?: boolean; retryAfterSeconds?: number; labels: Labels;
}>;

export function maskEmail(email: string): string {
  const [local, domain, ...extra] = email.trim().split("@");
  if (!local || !domain || extra.length) return "***";
  const parts = domain.split(".");
  const first = parts.shift();
  if (!first || parts.length === 0) return "***";
  return `${local[0]}***@${first[0]}***.${parts.join(".")}`;
}

function EmailSubmit({label, pendingLabel, disabled}: {label: string; pendingLabel: string; disabled: boolean}) {
  const {pending} = useFormStatus();
  return <button className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-primary-foreground disabled:opacity-50" disabled={pending || disabled} type="submit">
    {pending ? pendingLabel : label}
  </button>;
}

export function SignInForm({intent, locale, destination, action, googleEnabled, sent = false, retryAfterSeconds = 0, labels}: Props) {
  const [googlePending, setGooglePending] = useState(false);
  const [googleError, setGoogleError] = useState(false);
  const [email, setEmail] = useState("");
  const [masked, setMasked] = useState("");
  const [sentState, setSentState] = useState(sent);
  const [remaining, setRemaining] = useState(retryAfterSeconds);
  const maskKey = `hkwtia-login-mask-${intent}`;
  const waitKey = `hkwtia-login-resend-${intent}`;
  useEffect(() => {
    try {
      if (retryAfterSeconds > 0) sessionStorage.setItem(waitKey, String(Date.now() + retryAfterSeconds * 1000));
      const update = () => {
        setMasked(sessionStorage.getItem(maskKey) ?? "");
        setRemaining(Math.max(0, Math.ceil((Number(sessionStorage.getItem(waitKey)) - Date.now()) / 1000) || 0));
      };
      const initial = setTimeout(update, 0);
      const timer = setInterval(update, 1000);
      return () => {clearTimeout(initial); clearInterval(timer);};
    } catch { return; }
  }, [maskKey, waitKey, retryAfterSeconds]);

  async function startGoogle() {
    if (!googleEnabled || googlePending) return;
    setGooglePending(true);
    setGoogleError(false);
    const callbackURL = `${localizedPath(locale, intent === "admin" ? "/admin-login" : "/member-login")}?next=${encodeURIComponent(destination)}`;
    try {
      const result = await authClient.signIn.social({provider: "google", callbackURL});
      if (result?.error) setGoogleError(true);
    } catch {
      setGoogleError(true);
    } finally {
      setGooglePending(false);
    }
  }

  function rememberRecipient() {
    try {
      const safeMask = maskEmail(email);
      sessionStorage.setItem(maskKey, safeMask);
      sessionStorage.setItem(waitKey, String(Date.now() + 60_000));
    } catch { /* Private browser storage may be disabled; the server still limits sends. */ }
  }

  return <div>
    {sentState ? <div className="mt-4" role="status">
      <p>{labels.sent}{masked ? ` ${labels.maskedTo} ${masked}.` : ""}</p>
      <button className="mt-2 min-h-11 text-sm underline" onClick={() => {setSentState(false); setEmail("");}} type="button">{labels.changeEmail}</button>
    </div> : null}
    <button className="mt-8 flex min-h-11 w-full items-center justify-center rounded-md border border-input bg-background px-4 font-medium disabled:opacity-50" disabled={!googleEnabled || googlePending} onClick={() => void startGoogle()} type="button">
      {labels.google}
    </button>
    {!googleEnabled ? <p className="mt-2 text-sm text-muted-foreground">{labels.googleUnavailable}</p> : null}
    {googleError ? <p className="mt-3 text-sm text-destructive" role="alert">{labels.providerError}</p> : null}
    <p className="my-5 text-center text-sm text-muted-foreground">{labels.separator}</p>
    <form action={action} data-continuation={destination} data-testid={`${intent}-login-form`} onSubmit={rememberRecipient}>
      <label className="mb-2 block text-sm font-medium" htmlFor={`${intent}-login-email`}>{labels.email}</label>
      <input autoComplete="email" className="min-h-11 w-full rounded-md border border-input bg-background px-3" id={`${intent}-login-email`} name="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email}/>
      <EmailSubmit disabled={remaining > 0} label={sentState ? labels.resend : labels.send} pendingLabel={labels.sending}/>
      {remaining > 0 ? <p className="mt-2 text-sm text-muted-foreground">{labels.waitSeconds} {remaining}</p> : null}
    </form>
  </div>;
}

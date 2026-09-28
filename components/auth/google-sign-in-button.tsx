"use client";

import {useState} from "react";

import {authClient} from "@/lib/auth/client";

type Props = Readonly<{
  callbackURL: string;
  enabled: boolean;
  labels: Readonly<{google: string; googleUnavailable: string; providerError: string}>;
}>;

export function GoogleSignInButton({callbackURL, enabled, labels}: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function startGoogle() {
    if (!enabled || pending) return;
    setPending(true);
    setError(false);
    try {
      const result = await authClient.signIn.social({provider: "google", callbackURL});
      if (result?.error) setError(true);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return <>
    <button className="mt-8 flex min-h-11 w-full items-center justify-center rounded-md border border-input bg-background px-4 font-medium disabled:opacity-50" disabled={!enabled || pending} onClick={() => void startGoogle()} type="button">
      {labels.google}
    </button>
    {!enabled ? <p className="mt-2 text-sm text-muted-foreground">{labels.googleUnavailable}</p> : null}
    {error ? <p className="mt-3 text-sm text-destructive" role="alert">{labels.providerError}</p> : null}
  </>;
}
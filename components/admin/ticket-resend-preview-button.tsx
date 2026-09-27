"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";

import type {AppLocale} from "@/i18n/routing";
import {prepareAdminBatchAction} from "@/lib/admin/batches/actions";
import {localizedPath} from "@/lib/urls";

export function TicketResendPreviewButton({seatId, locale, label, errorLabel}: Readonly<{seatId: string; locale: AppLocale; label: string; errorLabel: string}>) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const prepare = async () => {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      const {batchId} = await prepareAdminBatchAction({operation: "ticket_resend", idempotencyKey: crypto.randomUUID(), targetSeatIds: [seatId], payload: {}});
      router.push(localizedPath(locale, `/admin/batches/${batchId}`));
    } catch {setError(true);}
    finally {setPending(false);}
  };
  return <span className="inline-flex flex-wrap items-center gap-2"><button className="min-h-11 rounded-md border px-3 text-sm text-primary disabled:opacity-50" disabled={pending} onClick={prepare} type="button">{label}</button>{error ? <span className="text-sm text-destructive" role="alert">{errorLabel}</span> : null}</span>;
}

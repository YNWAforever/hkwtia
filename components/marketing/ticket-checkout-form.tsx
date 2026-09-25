"use client";

import Link from "next/link";
import {useActionState, useEffect, useState} from "react";

import {MAX_TICKET_SEATS} from "@/config/tickets";
import {newAttemptId} from "@/lib/random-id";
import {submitTicketCheckoutAction, type TicketCheckoutState} from "@/lib/tickets/checkout-actions";

export type TicketCheckoutLabels = Readonly<{
  heading: string; buyerName: string; buyerEmail: string; seatCount: string;
  attendeeName: string; attendeeEmail: string; website: string;
  submit: string; submitting: string; refundPolicy: string;
  errors: Readonly<Record<string, string>>;
}>;

const initial: TicketCheckoutState = {status: "idle"};

export function TicketCheckoutForm({eventId, locale, pricePerSeat, labels, refundPolicyHref, defaultBuyerName = "", defaultBuyerEmail = ""}: Readonly<{
  eventId: string; locale: "en" | "zh-HK"; pricePerSeat: string; labels: TicketCheckoutLabels; refundPolicyHref: string;
  defaultBuyerName?: string; defaultBuyerEmail?: string;
}>) {
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [state, dispatch, pending] = useActionState(async (previous: TicketCheckoutState, formData: FormData) => {
    const result = await submitTicketCheckoutAction(previous, formData);
    if (result.status === "error" && (result.code === "RETRY_CHANGED" || result.code === "RETRY_EXPIRED")) setIdempotencyKey(newAttemptId());
    return result;
  }, initial);
  const [seatCount, setSeatCount] = useState(1);
  // Minted once, AFTER mount: a value minted during render differs between the
  // server and the client, which is a hydration mismatch. `newAttemptId` steps
  // down to `getRandomValues` because `crypto.randomUUID` is secure-context
  // only — one implementation, shared with the inbox composer. The submit button
  // stays disabled until it is non-empty, so a submit can never reach the server
  // without the uuid its schema requires.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time browser-only UUID after mount; render-time mint would mismatch server markup.
  useEffect(() => { setIdempotencyKey(newAttemptId()); }, []);

  useEffect(() => {
    if (state.status === "redirect") window.location.assign(state.url);
  }, [state]);

  // The action rotates the key only after an edited attempt is rejected.
  // Other errors keep their key, so an uncertain provider response remains safe to retry.
  const inputClass = "min-h-11 w-full rounded-md border border-input bg-background px-3";
  return (
    <form action={dispatch} className="space-y-4" noValidate>
      <h3 className="font-serif text-xl font-semibold">{labels.heading}</h3>
      <input name="eventId" type="hidden" value={eventId}/>
      <input name="locale" type="hidden" value={locale}/>
      <input name="idempotencyKey" type="hidden" value={idempotencyKey}/>
      {/* Honeypot: a bot fills it, a person never sees it. */}
      <label className="sr-only" htmlFor="ticket-website">{labels.website}</label>
      <input autoComplete="off" className="hidden" id="ticket-website" name="website" tabIndex={-1} type="text"/>
      <label className="block space-y-2 text-sm font-medium">
        <span>{labels.buyerName}</span>
        <input className={inputClass} defaultValue={defaultBuyerName} name="buyerName" required type="text"/>
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>{labels.buyerEmail}</span>
        <input className={inputClass} defaultValue={defaultBuyerEmail} name="buyerEmail" required type="email"/>
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>{labels.seatCount}</span>
        <select className={inputClass} onChange={(event) => setSeatCount(Number(event.target.value))} value={seatCount}>
          {Array.from({length: MAX_TICKET_SEATS}, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}
        </select>
      </label>
      {Array.from({length: seatCount}, (_, index) => (
        <div className="grid gap-3 sm:grid-cols-2" key={index}>
          <label className="block space-y-2 text-sm font-medium">
            <span>{labels.attendeeName} {index + 1}</span>
            <input className={inputClass} name={`seatName-${index}`} required type="text"/>
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>{labels.attendeeEmail} {index + 1}</span>
            <input className={inputClass} name={`seatEmail-${index}`} required type="email"/>
          </label>
        </div>
      ))}
      <p className="text-sm text-muted-foreground">{pricePerSeat}</p>
      <p className="text-sm"><Link className="underline" href={refundPolicyHref}>{labels.refundPolicy}</Link></p>
      <button className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={pending || idempotencyKey === ""} type="submit">
        {pending ? labels.submitting : labels.submit}
      </button>
      {state.status === "error" ? <p className="text-sm text-destructive" role="alert">{labels.errors[state.code] ?? labels.errors.INVALID}</p> : null}
    </form>
  );
}

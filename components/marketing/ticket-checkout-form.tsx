"use client";

import {useActionState, useEffect, useState} from "react";

import {submitTicketCheckoutAction, type TicketCheckoutState} from "@/lib/tickets/checkout-actions";

export type TicketCheckoutLabels = Readonly<{
  heading: string; buyerName: string; buyerEmail: string; seatCount: string;
  attendeeName: string; attendeeEmail: string; website: string; pricePerSeat: string;
  submit: string; submitting: string;
  errors: Readonly<Record<string, string>>;
}>;

const MAX_SEATS = 10;
const initial: TicketCheckoutState = {status: "idle"};

export function TicketCheckoutForm({eventId, locale, pricePerSeat, labels, defaultBuyerName = "", defaultBuyerEmail = ""}: Readonly<{
  eventId: string; locale: "en" | "zh-HK"; pricePerSeat: string; labels: TicketCheckoutLabels;
  defaultBuyerName?: string; defaultBuyerEmail?: string;
}>) {
  const [state, dispatch, pending] = useActionState(submitTicketCheckoutAction, initial);
  const [seatCount, setSeatCount] = useState(1);
  // Minted once per form instance, so a retry after a network error reuses the
  // same key and cannot charge twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (state.status === "redirect") window.location.assign(state.url);
  }, [state]);

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
          {Array.from({length: MAX_SEATS}, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}
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
      <button className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={pending} type="submit">
        {pending ? labels.submitting : labels.submit}
      </button>
      {state.status === "error" ? <p className="text-sm text-destructive" role="alert">{labels.errors[state.code] ?? labels.errors.INVALID}</p> : null}
    </form>
  );
}

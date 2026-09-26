"use client";

import Link from "next/link";
import {useActionState, useEffect, useState} from "react";

import {MAX_TICKET_SEATS} from "@/config/tickets";
import {newAttemptId} from "@/lib/random-id";
import {submitTicketCheckoutAction, type TicketCheckoutState} from "@/lib/tickets/checkout-actions";
import {formatTicketPrice} from "@/lib/tickets/format";

export type TicketCheckoutLabels = Readonly<{
  heading: string; buyerName: string; buyerEmail: string; seatCount: string;
  attendeeName: string; attendeeEmail: string; website: string;
  submit: string; submitting: string; refundPolicy: string;
  fillBuyer: string; removeSeat: string; total: string; paymentNature: string; eventDate: string;
  fieldErrors: Readonly<{required: string; invalid: string; extra: string}>;
  errors: Readonly<Record<string, string>>;
}>;

type Attendee = Readonly<{name: string; email: string}>;
const emptyAttendee = (): Attendee => ({name: "", email: ""});
const initial: TicketCheckoutState = {status: "idle"};

export function TicketCheckoutForm({eventId, locale, pricePerSeat, unitAmountHkdCents, eventStartsAt, labels, refundPolicyHref, defaultBuyerName = "", defaultBuyerEmail = ""}: Readonly<{
  eventId: string; locale: "en" | "zh-HK"; pricePerSeat: string; unitAmountHkdCents: number;
  eventStartsAt?: string; labels: TicketCheckoutLabels; refundPolicyHref: string;
  defaultBuyerName?: string; defaultBuyerEmail?: string;
}>) {
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [state, dispatch, pending] = useActionState(async (previous: TicketCheckoutState, formData: FormData) => {
    const result = await submitTicketCheckoutAction(previous, formData);
    if (result.status === "error" && (result.code === "RETRY_CHANGED" || result.code === "RETRY_EXPIRED")) setIdempotencyKey(newAttemptId());
    return result;
  }, initial);
  const [buyerName, setBuyerName] = useState(defaultBuyerName);
  const [buyerEmail, setBuyerEmail] = useState(defaultBuyerEmail);
  const [seats, setSeats] = useState<readonly Attendee[]>([emptyAttendee()]);
  const seatCount = seats.length;
  const setSeatCount = (count: number) => setSeats((current) => count < current.length
    ? current.slice(0, count)
    : [...current, ...Array.from({length: count - current.length}, emptyAttendee)]);
  const setSeat = (index: number, field: keyof Attendee, value: string) => setSeats((current) =>
    current.map((seat, seatIndex) => seatIndex === index ? {...seat, [field]: value} : seat));
  const fieldError = (name: string) => {
    const code = state.status === "error" ? state.fieldErrors?.[name] : undefined;
    return code ? <p className="text-sm text-destructive" id={`ticket-${name}-error`} role="alert">{labels.fieldErrors[code]}</p> : null;
  };

  // Minted once after mount: render-time minting differs across server/client markup.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only UUID after mount avoids hydration mismatch.
  useEffect(() => { setIdempotencyKey(newAttemptId()); }, []);
  useEffect(() => {
    if (state.status === "redirect") window.location.assign(state.url);
  }, [state]);

  // A refusal that might hide an uncertain provider outcome keeps the same key.
  const inputClass = "min-h-11 w-full rounded-md border border-input bg-background px-3";
  return (
    <form action={dispatch} className="space-y-4" noValidate>
      <h3 className="font-serif text-xl font-semibold">{labels.heading}</h3>
      <input name="eventId" type="hidden" value={eventId}/>
      <input name="locale" type="hidden" value={locale}/>
      <input name="idempotencyKey" type="hidden" value={idempotencyKey}/>
      <label className="sr-only" htmlFor="ticket-website">{labels.website}</label>
      <input autoComplete="off" className="hidden" id="ticket-website" name="website" tabIndex={-1} type="text"/>
      <label className="block space-y-2 text-sm font-medium">
        <span>{labels.buyerName}</span>
        <input className={inputClass} name="buyerName" onChange={(event) => setBuyerName(event.target.value)} required type="text" value={buyerName}/>
        {fieldError("buyerName")}
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>{labels.buyerEmail}</span>
        <input className={inputClass} name="buyerEmail" onChange={(event) => setBuyerEmail(event.target.value)} required type="email" value={buyerEmail}/>
        {fieldError("buyerEmail")}
      </label>
      <button className="text-sm underline" onClick={() => setSeats((current) => current.map((seat, index) => index === 0 ? {name: buyerName, email: buyerEmail} : seat))} type="button">{labels.fillBuyer}</button>
      <label className="block space-y-2 text-sm font-medium">
        <span>{labels.seatCount}</span>
        <select className={inputClass} name="quantity" onChange={(event) => setSeatCount(Number(event.target.value))} value={seatCount}>
          {Array.from({length: MAX_TICKET_SEATS}, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}
        </select>
        {fieldError("quantity")}
      </label>
      {seats.map((seat, index) => (
        <div className="grid gap-3 sm:grid-cols-2" key={index}>
          <label className="block space-y-2 text-sm font-medium">
            <span>{labels.attendeeName} {index + 1}</span>
            <input className={inputClass} name={`seatName-${index}`} onChange={(event) => setSeat(index, "name", event.target.value)} required type="text" value={seat.name}/>
            {fieldError(`seatName-${index}`)}
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>{labels.attendeeEmail} {index + 1}</span>
            <input className={inputClass} name={`seatEmail-${index}`} onChange={(event) => setSeat(index, "email", event.target.value)} required type="email" value={seat.email}/>
            {fieldError(`seatEmail-${index}`)}
          </label>
          {index > 0 ? <button className="text-sm underline sm:col-span-2" onClick={() => setSeats((current) => current.filter((_, seatIndex) => seatIndex !== index))} type="button">{labels.removeSeat}</button> : null}
        </div>
      ))}
      {eventStartsAt ? <p className="text-sm">{labels.eventDate}: {new Intl.DateTimeFormat(locale, {dateStyle: "long", timeStyle: "short", timeZone: "Asia/Hong_Kong"}).format(new Date(eventStartsAt))}</p> : null}
      <p className="text-sm text-muted-foreground">{pricePerSeat}</p>
      <p className="text-sm font-semibold">{labels.total}: {formatTicketPrice(unitAmountHkdCents * seatCount, locale)}</p>
      <p className="text-sm text-muted-foreground">{labels.paymentNature}</p>
      <p className="text-sm"><Link className="underline" href={refundPolicyHref}>{labels.refundPolicy}</Link></p>
      <button className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={pending || idempotencyKey === ""} type="submit">
        {pending ? labels.submitting : labels.submit}
      </button>
      {state.status === "error" ? <p className="text-sm text-destructive" role="alert">{labels.errors[state.code] ?? labels.errors.INVALID}</p> : null}
    </form>
  );
}

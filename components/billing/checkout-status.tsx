"use client";

import {useEffect, useState} from "react";

import {MEMBERSHIP_CHECKOUT_MAX_POLLS, MEMBERSHIP_CHECKOUT_POLL_INTERVAL_MS} from "@/lib/billing/checkout-polling";

export type CheckoutStatus = "processing" | "active" | "review" | "failed";

type CheckoutStatusProps = Readonly<{
  status: CheckoutStatus;
  labels: Readonly<Record<CheckoutStatus, string>>;
  statusUrl?: string;
  timeoutLabel?: string;
  portal?: Readonly<{href: string; label: string}>;
  review?: Readonly<{href: string; label: string}>;
  manualCheck?: Readonly<{href: string; label: string}>;
  support?: Readonly<{href: string; label: string}>;
}>;

function isCheckoutStatus(value: unknown): value is CheckoutStatus {
  return value === "processing" || value === "active" || value === "review" || value === "failed";
}

export function CheckoutStatus({status, labels, statusUrl, timeoutLabel, portal, review, manualCheck, support}: CheckoutStatusProps) {
  const [current, setCurrent] = useState<CheckoutStatus>(status);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!statusUrl || current !== "processing") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    const controller = new AbortController();

    async function poll() {
      try {
        const response = await fetch(statusUrl!, {cache: "no-store", credentials: "same-origin", signal: controller.signal});
        if (response.ok) {
          const body: unknown = await response.json();
          const next = typeof body === "object" && body !== null && "status" in body ? body.status : null;
          if (isCheckoutStatus(next) && next !== "processing") {
            if (!cancelled) setCurrent(next);
            return;
          }
        }
      } catch {
        // A failed status read says nothing about whether the payment succeeded.
      }
      if (cancelled) return;
      polls += 1;
      if (polls >= MEMBERSHIP_CHECKOUT_MAX_POLLS) {
        setTimedOut(true);
      } else {
        timer = setTimeout(poll, MEMBERSHIP_CHECKOUT_POLL_INTERVAL_MS);
      }
    }

    timer = setTimeout(poll, MEMBERSHIP_CHECKOUT_POLL_INTERVAL_MS);
    return () => {cancelled = true; if (timer) clearTimeout(timer); controller.abort();};
  }, [current, statusUrl]);

  const action = current === "active" ? portal : current === "review" ? review : null;
  return (
    <div>
      <p aria-live="polite" data-checkout-status={current} role="status">{labels[current]}</p>
      {current === "processing" && timedOut && <p className="mt-3" role="note">{timeoutLabel}</p>}
      {action && <a className="mt-4 inline-flex text-primary underline" href={action.href}>{action.label}</a>}
      {current === "processing" && timedOut && <div className="mt-4 flex gap-5">
        {manualCheck && <a className="text-primary underline" href={manualCheck.href}>{manualCheck.label}</a>}
        {support && <a className="text-primary underline" href={support.href}>{support.label}</a>}
      </div>}
      {current === "failed" && support && <a className="mt-4 inline-flex text-primary underline" href={support.href}>{support.label}</a>}
    </div>
  );
}

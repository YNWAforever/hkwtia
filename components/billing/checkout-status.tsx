"use client";

export type CheckoutStatus = "processing" | "active" | "failed";

type CheckoutStatusProps = Readonly<{
  status: CheckoutStatus;
  labels: Readonly<Record<CheckoutStatus, string>>;
}>;

export function CheckoutStatus({status, labels}: CheckoutStatusProps) {
  return (
    <p aria-live="polite" data-checkout-status={status} role="status">
      {labels[status]}
    </p>
  );
}

import "server-only";

import type {Actor} from "@/lib/membership/lifecycle";
import {
  getAuthorizedBillingMembership,
  type CheckoutDependencies,
} from "@/lib/billing/checkout-service";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import {stripeBillingAdapter} from "@/lib/billing/stripe";

export type Receipt = Readonly<{
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: string | null;
  hostedInvoiceUrl: string | null;
}>;

type ReceiptDependencies = Pick<CheckoutDependencies, "stripe" | "memberships">;

function defaultDependencies(): ReceiptDependencies {
  return {
    stripe: stripeBillingAdapter(),
    memberships: membershipsRepository,
  };
}

export async function listReceipts(
  actor: Actor,
  membershipId: string,
  dependencies: ReceiptDependencies = defaultDependencies(),
): Promise<Receipt[]> {
  const membership = await getAuthorizedBillingMembership(actor, membershipId, dependencies);
  const invoices = await dependencies.stripe.listInvoices(membership.stripeCustomerId!);
  return invoices.map((invoice) => ({
    id: invoice.id,
    date: new Date(invoice.created * 1000).toISOString(),
    amount: invoice.amountPaid,
    currency: invoice.currency.toUpperCase(),
    status: invoice.status,
    hostedInvoiceUrl: invoice.hostedInvoiceUrl,
  }));
}

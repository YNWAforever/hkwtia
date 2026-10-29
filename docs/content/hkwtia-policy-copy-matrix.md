# HKWTIA membership copy and policy matrix

This matrix records what the 2026-09-27 implementation can state from current code and what still needs an association decision. It is an editorial control, not an approval of membership terms. The public FAQ uses support links where policy is unverified.

| Public question | Current source | Safe statement implemented | Policy / provider gate |
|---|---|---|---|
| Who may apply? | `config/membership-journey.ts`; `lib/membership/plans.ts` | Individual is one person. Corporate and Platinum are organisations. All three pay online. Legacy Community, Startup, and Patron codes stay for existing rows. | Formal eligibility and any exceptions require WTIA approval. |
| What does it cost? | `OPS_MEMBERSHIP_TIERS` in `config/membership-journey.ts`; Stripe Price IDs | Public cards show Individual HK$500, Corporate HK$1,800, and Platinum HK$4,800 per year. Checkout confirms the Stripe amount. | Corporate reuses `STRIPE_CORPORATE_PRICE_ID` (confirm that Price is HK$1,800). `STRIPE_INDIVIDUAL_PRICE_ID` and `STRIPE_PLATINUM_PRICE_ID` are not set. Do not call a fee provider-confirmed until those Prices exist. |
| Does it renew? | `lib/billing/stripe.ts` creates a subscription checkout; `lib/billing/webhook-service.ts` handles subscription and invoice events. | The online paid route is a recurring subscription checkout. | Renewal cadence, notice, cancellation rights and any bespoke agreements require WTIA policy confirmation. |
| How are payments or cancellations handled? | `lib/billing/checkout-service.ts`; `/join/checkout`; `/portal/billing` | Secure checkout starts only after an explicit action; existing subscription state is shown in the portal. Contact WTIA for cancellations or alternate arrangements. | No public self-cancel policy or irreversible provider action is introduced here. |
| How many company seats? | `PLAN_CATALOG` in `lib/membership/plans.ts`; existing seat repository | Individual is one seat. Corporate and Platinum are 25. Company owners or admins manage invitations. | Confirm contractual entitlements and exception handling before treating site defaults as association policy. |
| When is an application approved? | Stripe checkout for Individual, Corporate, and Platinum. Legacy Patron stays a manual exception. | Standard membership is confirmed when payment succeeds. Questions and special cases: WTIA aims to reply within 5 working days. A manual exception is reviewed by Willy alone. | Do not describe a committee review before payment. |
| Can membership be refunded? | `RefundPolicy` bundle and `/refund-policy` cover **event tickets**; billing refund flows are distinct. | The FAQ explicitly labels that linked policy as event-ticket policy and sends membership terms to WTIA. | WTIA must provide a membership-specific refund/cancellation policy before any entitlement is published. |
| Are invoices available? | Portal billing status and Stripe payment records | The FAQ directs invoice/receipt requests to WTIA. | Verify Stripe invoice rendering, ownership and legal invoice wording before promising downloads or dates. |
| How do person and company relate? | `profiles`, `company_members`, `memberships`, seat invitation and scoped billing repositories | Personal profile and company membership remain separate; owner/admin seat invitations do not erase personal history. | Company representation and access rights stay governed by existing grants and membership policy. |
| Legal brand name | `config/site.ts`, existing public messages | Existing brand/legal copy stays in place. | Association confirms legal Chinese/English names before a rename. |

## Rendering rules

- Public fees on the homepage and `/membership` come from `OPS_MEMBERSHIP_TIERS`, not from a database catalog row. Checkout still confirms the Stripe amount. A missing Individual or Platinum price id fails checkout closed.
- The public FAQ is bilingual in `messages/en.json` and `messages/zh-HK.json`. Questions about contractual terms describe the current flow and direct the visitor to `/contact`.
- `Stripe` subscription mode is code evidence, not live Price verification or approval of an association renewal rule. Do not infer a refund rule from the event-ticket policy.

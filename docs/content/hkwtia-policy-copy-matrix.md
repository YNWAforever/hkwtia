# HKWTIA membership copy and policy matrix

This matrix records what the 2026-09-27 implementation can state from current code and what still needs an association decision. It is an editorial control, not an approval of membership terms. The public FAQ uses support links where policy is unverified.

| Public question | Current source | Safe statement implemented | Policy / provider gate |
|---|---|---|---|
| Who may apply? | `lib/membership/plans.ts`; `lib/membership/public-catalog.ts`; current `Membership.tiers` | Community is an individual route; Startup and Corporate are organisation routes; Patron starts with staff. | Formal eligibility and any exceptions require WTIA approval. |
| What does it cost? | Persisted `membership_plans`, `buildPublicMembershipCatalog`, configured Stripe Price IDs | Both membership page and home use the same validated catalog. Only reconciled fees appear; checkout confirms the final amount. | The audit did not verify configured IDs or amounts against Stripe test/live Prices. Do not call a fee provider-confirmed until reconciled. |
| Does it renew? | `lib/billing/stripe.ts` creates a subscription checkout; `lib/billing/webhook-service.ts` handles subscription and invoice events. | The online paid route is a recurring subscription checkout. | Renewal cadence, notice, cancellation rights and any bespoke agreements require WTIA policy confirmation. |
| How are payments or cancellations handled? | `lib/billing/checkout-service.ts`; `/join/checkout`; `/portal/billing` | Secure checkout starts only after an explicit action; existing subscription state is shown in the portal. Contact WTIA for cancellations or alternate arrangements. | No public self-cancel policy or irreversible provider action is introduced here. |
| How many company seats? | `PLAN_CATALOG` in `lib/membership/plans.ts`; existing seat repository | Site defaults are five Startup and 25 Corporate seats; company owners/admins manage invitations. | Confirm contractual entitlements and exception handling before treating site defaults as association policy. |
| When is an application approved? | `applicationsRepository` and admin review workflow | The portal shows persisted progress. No fixed review deadline is promised. | WTIA must approve any SLA or automatic approval claim. |
| Can membership be refunded? | `RefundPolicy` bundle and `/refund-policy` cover **event tickets**; billing refund flows are distinct. | The FAQ explicitly labels that linked policy as event-ticket policy and sends membership terms to WTIA. | WTIA must provide a membership-specific refund/cancellation policy before any entitlement is published. |
| Are invoices available? | Portal billing status and Stripe payment records | The FAQ directs invoice/receipt requests to WTIA. | Verify Stripe invoice rendering, ownership and legal invoice wording before promising downloads or dates. |
| How do person and company relate? | `profiles`, `company_members`, `memberships`, seat invitation and scoped billing repositories | Personal profile and company membership remain separate; owner/admin seat invitations do not erase personal history. | Company representation and access rights stay governed by existing grants and membership policy. |
| Legal brand name | `config/site.ts`, existing public messages | Existing brand/legal copy stays in place. | Association confirms legal Chinese/English names before a rename. |

## Rendering rules

- No static amount is stored in homepage copy. `components/home/conversion-paths.tsx` and `/membership` both use `buildPublicMembershipCatalog` on persisted rows and configured Price IDs. A failed or mismatched read omits the fee and points to the membership team.
- The public FAQ is bilingual in `messages/en.json` and `messages/zh-HK.json`. Questions about contractual terms describe the current flow and direct the visitor to `/contact`.
- `Stripe` subscription mode is code evidence, not live Price verification or approval of an association renewal rule. Do not infer a refund rule from the event-ticket policy.

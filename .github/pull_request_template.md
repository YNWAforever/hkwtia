## Scope and boundary

- [ ] I state the intended PR scope and its explicit must-not-include boundary from `docs/integration/wisetech-delivery-gates.md`.
- [ ] I did not add unrelated visual, schema, auth/payment, deployment, or production-cutover work.

## Local evidence

- [ ] Focused RED evidence is linked or quoted, including the expected pre-implementation failure.
- [ ] Focused GREEN evidence is linked or quoted.
- [ ] `npm.cmd run audit:strings`
- [ ] `npm.cmd test`
- [ ] `npm.cmd run lint`
- [ ] `npm.cmd run typecheck`
- [ ] `npm.cmd run build`
- [ ] `npm.cmd audit --omit=dev --audit-level=high`
- [ ] Route/content parity is checked against the current manifest and evidence documents.
- [ ] Database/provider gates are recorded as not applicable, not run, or independently evidenced.
- [ ] Rollback notes identify the independently deployable commit/PR and any application-only rollback constraints.

## Delivery gates — fail closed

- [ ] Site source archive transfer has hash-verified reconciliation evidence.
- [ ] GitHub branch protection requires the `quality` check on `main`.
- [ ] isolated Neon/test identities/providers are provisioned and independently verified.
- [ ] Preview/UAT has an isolated preview URL, test evidence, and rollback owner.
- [ ] production approval is explicitly recorded by the authorized approver.
- [ ] 6 September 2026 unsubscribe fallback deadline has a verified fallback outcome.

Do not mark an external gate as passed without recorded evidence.

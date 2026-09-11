# Captured Woztell payloads

This directory is empty on purpose, and filling it is an **owner action gated on
production access** — row 3 of the ordered table in
[`docs/integration/phase-c-whatsapp-go-live.md`](../../../docs/integration/phase-c-whatsapp-go-live.md).

Phase C1's delivery-status and outbound-echo discriminators in
`lib/channels/woztell.ts` are a **best guess**: this tree has no Woztell
credentials, no captured provider payload and no provider documentation, and the
only inbound envelope it has ever seen is
`{from, type:"TEXT", messageId, timestamp, data:{text}}` (plan C1, open question
O-1). Until one real payload of each kind has been replayed through
`normalizeInbound`, "the ticks do not arrive" after go-live is a normaliser bug
first and a provider problem second, and nothing else in the tree tells you
which — the webhook route answers `202` for every outcome and logs nothing on
purpose.

## What to drop here

One file per captured payload, named `woztell-*.json`, containing the **raw
webhook body** exactly as Woztell posted it — no wrapper, no edits:

| File name | Proves |
|---|---|
| `woztell-delivery-status-<anything>.json` | a delivery tick normalises to `delivery_status` |
| `woztell-outbound-echo-<anything>.json` | an echo of a message we sent normalises to `outbound_echo` |
| `woztell-inbound-<anything>.json` | an inbound message normalises to `message` |

`tests/unit/woztell-normalizer-captured.test.ts` picks up every such file
automatically and asserts it lands on a handled variant — and on the variant the
file name claims, because a delivery tick that normalised to `outbound_echo`
would otherwise pass. The three prefixes above are therefore **required**: a
`woztell-*.json` whose name matches none of them fails the run rather than
falling back to the weaker "not unsupported" check. With this directory empty
the test **skips cleanly**; the
moment a file lands it becomes a hard gate, with no code change.

## Before committing one

These are real provider payloads, so they carry a real phone number and real
message text. **Redact both** before committing: replace the sender/recipient
with a test number and the message body with placeholder text. That is always
safe, because substituting digits for digits and text for text leaves everything
the replay asserts intact — the field names, the nesting and the value types.

What must **not** change is the shape. Turning a `"timestamp"` from a string into
a number, dropping a field because it looked empty, or unwrapping a nested object
is exactly the kind of edit that would make the fixture agree with the guess
rather than correct it. If a redaction would require changing a value's type,
stop and ask rather than committing the real value: a payload that cannot be
redacted without reshaping it is one to describe in the checklist row, not to
store here permanently.

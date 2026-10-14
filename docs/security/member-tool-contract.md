# Member tool authorization contract — T-MP12A

Status: **awaiting evidence**. This is the contract investigation for F-MP12 / UC-MP46 and UC-MP57. It does not close T-MP12B or prove an external authorization failure.

Repository baseline: `e8254bab79cff5945da4abe995a7c075d0ce3d57`.

## Observed local contract

| Field | `content-calendar` |
| --- | --- |
| Destination | `https://content-calendar-internal.vercel.app/` |
| Portal eligibility | Startup, Corporate or Patron with a benefit-eligible membership status; the existing entitlement policy remains authoritative. |
| Credential source | Optional `MEMBER_TOOL_CONTENT_CALENDAR_TOKEN`, parsed by `memberToolsEnv()`; no credential value was read for this investigation. |
| Browser transport | `toolFrameSrc()` places the configured value in the iframe URL's `token` query parameter. Encoding preserves a single parameter. |
| Local identity binding | The portal checks membership before rendering. The URL builder receives a tool and an environment value, with no member/company identifier or per-launch nonce. |
| Missing configuration | The page renders an unavailable state and omits the iframe. |
| Referrer policy | The iframe uses `no-referrer`. This does not remove the value from the iframe URL or browser DOM. |
| CSP | Allowed frame origins are derived from `MEMBER_TOOLS`. |

Sources: `config/member-tools.ts`, `lib/portal/member-tools.ts`, `lib/config/env.ts`, `app/[locale]/(member)/portal/tools/[key]/page.tsx`, `.env.example`, and the existing tool unit tests. The continuation evidence's R14-09 used a synthetic value: it establishes the query construction path, not use or leakage of a production credential.

## External contract still required

| Contract field | Evidence required before implementation |
| --- | --- |
| Token purpose and bearer semantics | Tool-side authentication specification and a synthetic allow/deny test. The environment documentation calls it a secret; whether possession alone authorizes access is not established. |
| Issuer and audience | Named issuer, permitted audience/origin, validation rules and versioned contract. |
| Member/company binding | Tool-side subject/tenant mapping and cross-member/cross-company rejection tests. |
| Launch TTL and single use | Confirmed expiry value, atomic consumption behavior and replay rejection. No duration is assumed. |
| Tool session lifetime | Confirmed idle/absolute expiry and cookie/session behavior. The portal comment about partitioned cookies is not tool-side evidence. |
| Revocation | Supported mechanism and confirmed time bound for seat revocation, membership cancellation/expiry and existing tool sessions. |
| Logging | Tool, proxy and analytics treatment of the launch value, plus verified redaction in a synthetic test environment. |
| Exchange interface | Endpoint, HTTP/authentication contract, response schema, approved destination validation, error codes and safe retry semantics. |
| Test interface and owner | Tool repository or protocol document, technical owner, isolated test endpoint and synthetic identities. |

A connected repository search for `content-calendar` returned no accessible match in this session. That is an access/discovery result, not evidence that the tool has no repository or protocol.

## Implementation decision

T-MP12A remains blocked on one external dependency: a versioned tool-side authorization contract and its test environment/owner. T-MP12B must not invent an exchange endpoint, TTL, audience, revocation guarantee or single-use store.

If the confirmed contract uses a reusable bearer credential, replace browser delivery of the shared credential with a supported server-to-server exchange or equivalent approved tool mechanism. Acceptance must cover cross-member/company access, replay, expiry, revocation of existing sessions, concurrent consumption, safe retry, and browser/log exposure using synthetic values. If the value is not an authorization secret, record that evidence and test the actual protections instead.

Moving the value to a fragment, renaming the environment variable, or placing it in another browser field is not completion. Production rotation, tool-side changes and cutover are separate operations; none was performed here.

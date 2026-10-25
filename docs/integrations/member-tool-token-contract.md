# Member tool token contract — T-MP12A

Source inspection on R1 rebuild, 2026-10-25:

| Property | Proven source behavior | External contract |
| --- | --- | --- |
| Tool registry | config/member-tools.ts content-calendar, configured origin, token query parameter | Provider ownership/contract UNKNOWN |
| Credential source | memberToolsEnv().contentCalendarToken, read server-side after portal actor and eligible membership checks | Bearer semantics UNKNOWN |
| Transport | lib/portal/member-tools.ts toolFrameSrc uses URLSearchParams; portal/tools/[key]/page.tsx puts result in iframe src | Provider authorization semantics UNKNOWN |
| Browser exposure | Token-bearing iframe URL reaches browser; referrerPolicy no-referrer is set | Does not prove protection from history, provider logs or replay |
| Missing configuration | Local page renders unavailable, no iframe | Proven in source only |
| TTL/audience/scope | No per-user exchange in located path | UNKNOWN |
| Expiry/replay/revoke/cross-user | No sandbox test performed | BLOCKED |

No production token was read. No provider request was made. URL transport alone proves neither bearer authority nor safety. Obtain written provider semantics and authorized sandbox test token, then run legitimate identity plus expired/replayed/cross-user/revoked negative controls. Only then decide whether a server exchange or feature disable is required (T-MP12B). No sandbox PASS or no-change acceptance is claimed.

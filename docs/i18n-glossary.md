# Traditional Chinese glossary (zh-HK)

The target register is **Traditional Chinese as written in Hong Kong**, for a professional industry
association. Not Simplified, and not Taiwan-style Traditional — the two differ in vocabulary even though
they share the script.

This file exists because `AGENTS.md` requires the bundles to stay in *parity* — same keys — and nothing
checked anything else. That is how an entire namespace shipped as `"?? CSV"` and `"????"` from M2 until it
was found by inspection, with every test green throughout. `tests/unit/messages.test.ts` now enforces the
mechanical half of what is written here; the rest is judgement, which is what this document is for.

## Enforced by tests

`tests/unit/messages.test.ts` fails the build if any of these is violated:

- every `zh-HK` value containing Latin letters must also contain a CJK character, unless its key is in the
  `latinByDesign` allowlist (proper nouns, the language toggle, a numeric counter);
- no value may contain a run of two or more ASCII `?` — the signature of a lossy encoding round-trip;
- no `_`-prefixed bookkeeping key may exist anywhere except the root `_review`;
- `en` and `zh-HK` must have identical leaf keys, and every ICU plural must format.

`npm run audit:strings` (`scripts/audit-visible-strings.mjs`) fails the build on visible copy that never
reaches the bundle at all:

- hard-coded text in JSX, unless it is an email address, a phone number, an approved technical id, or
  purely locale-neutral glyphs (`· • → ← ✓ ✗ — – / | ( ) [ ] #`). Notably **`:` is not neutral** — see
  Punctuation below;
- English prose in a `const` that is rendered through a JSX expression. References from a JSX *attribute*
  are exempt, so `className` strings, `cva()` maps and render helpers stay quiet;
- English prose in a `placeholder`, `aria-label`, `alt` or `title` string literal.

## Hong Kong, not Taiwan

Both write Traditional, but the vocabulary differs. Use the left column.

| Use (HK) | Not (TW) | Meaning |
|---|---|---|
| 軟件 / 硬件 | 軟體 / 硬體 | software / hardware |
| 網絡 | 網路 | network |
| 用戶 | 使用者 | user |
| 人工智能 | 人工智慧 | artificial intelligence |
| 項目 | 專案 | project |
| 質素 | 品質 | quality |
| 流動 | 行動 | mobile |
| 電郵 | 電子郵件 | email |

`人工智慧` is the usual giveaway that copy was drafted for a Taiwan audience.

## Domain terms

| English | Chinese | Note |
|---|---|---|
| WTIA | WTIA | never translated; space it from adjacent CJK |
| member (of the association) | 會員 | |
| member (a seat in a company) | 成員 | **deliberately different** — a company's people, not association members |
| membership (the programme) | 會員計劃 | the public offering, as in navigation |
| membership (an individual's) | 會籍 | **deliberately different** — what one person holds |
| membership tier | 會員級別 | |
| segment | 分群 | the whole `Admin.segments` namespace |
| showcase | 展示頁 | |
| Launch Pad | 創科起動 | translated, not transliterated |
| Concierge | Concierge | product name, left in English |
| AI-Ops | AI-Ops | product name |
| cohort | 小組 | |
| committee | 委員會 | |
| stakeholder | 持份者 | HK usage; not 利益相關者 |
| innovation and technology | 創科 | the HK contraction, not 創新技術 |
| patron (the tier) | 贊助人 | the tier's proper name everywhere |
| slug | 網址代號 | |
| published | 已發布 | pinned by `aiops-page.test.tsx`; do not switch to 已發佈 |
| first-year renewal | 首年續會率 | pinned by `aiops-page.test.tsx` |

## Terms that correctly differ by context

Do **not** "fix" these into one word. A naive consistency sweep will want to; each is a distinct concept.

| English | Renderings | Why |
|---|---|---|
| Active | 進行中 / 已啟用 / 生效 | a cohort running / an account enabled / a membership in force |
| Company | 公司 / 公司資料 | a table column / a form section ("company details") |
| Connect | 聯絡 / 連繫 | a contact link / "connecting" as a marketing idea |
| Reject | 拒絕 / 退回 | decline outright / send back for revision |
| Due | 已到期 / 應續會 | an overdue job / renewals coming due |
| Not available | 未提供 / 未有資料 | a field nobody supplied / a metric with no data |
| Renewal | 續期 / 續期日 | the event / the date column |

## Punctuation and spacing

- Full-width punctuation in Chinese text: `，。：；？！` and `「」` for quotes.
- **Never write a literal `:` in JSX.** A `label: value` pair goes through `labelSeparator(locale)` or
  `labelledValue(locale, label, value)` from `lib/i18n/punctuation.ts`. The full-width `：` carries its own
  trailing whitespace, so English needs the space after the colon and Chinese must not have it — eight call
  sites got this wrong and rendered `會員: 1` until the audit stopped exempting punctuation.
- The Chinese ellipsis is **two characters**, `……` — used for every progress indicator
  (`儲存中……`, `傳送中……`). A single `…` is correct only where it trails an example sentence.
- Titles separate with the full-width pipe: `會員計劃｜WTIA`.
- Put a space either side of Latin words and numerals embedded in Chinese: `匯出 CSV`, `WTIA 會員`.
- Parentheses around a Chinese qualifier are full-width: `名稱（英文）`.

## Where Chinese lives outside the bundle

A bundle-only review misses these. All are visitor-reachable:

- `config/funding-schemes.ts` — scheme names, eligibility paragraphs, and the legal disclaimer, rendered
  on `/zh/launchpad` and quoted by the Concierge.
- `lib/ai/agents/concierge.ts` — the safety refusal and low-confidence handoff.
- `config/landing-partners.json` — partner organisation names.
- `scripts/seed-m*.ts` — event, showcase, cohort and build-log fixtures.
- `messages/*.json` → `Email.*` — 119 leaves read directly by `lib/email/catalog.ts`, never through
  next-intl, so they never appear on a page and are pinned by snapshot tests instead.

Copy must not live in a component-level `const`. The `/zh/ai-ops` architecture diagram held its nodes that
way and rendered `guarded tools` under a paragraph that already said 受限制工具; `audit:strings` now
rejects the pattern.

Two `aria-label`s are knowingly left with an ASCII separator — `components/admin/cohort-kanban.tsx` and
`components/admin/showcase-review-table.tsx`. Neither component takes a `locale`, and threading one through
for a screen-reader separator on a staff-only page is not worth the prop. Revisit if either gains a
`locale` for another reason.

## Review status

`messages/zh-HK.json` carries a root `"_review": true`. It means **no native Hong Kong reviewer has signed
off on tone and register**. Mechanical correctness is now enforced by tests; that flag is about voice, and
only a human can clear it.

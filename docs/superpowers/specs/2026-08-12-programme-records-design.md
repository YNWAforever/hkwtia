# Programme Records Design

Migration sub-project 3 of 4. Read `docs/wtia-programme-claims-review.md` before this — it
records thirteen claims in the content audit that WTIA's own archive contradicts, and this
design exists partly to stop those reaching a public page.

## Goal and acceptance boundary

`/programs/asa`, `/programs/hkict`, `/programs/cpai` and `/programs/tct` are one-line stubs.
They say nothing about editions, years, funders or winners — which is the strongest evidence
WTIA has of its own track record.

This sub-project fills them with **what the captured archive honestly supports**, and nothing
else. Done when each page states which editions ran when, who funded each, and the winners the
archive actually names; links out where the record lives on a microsite; and repeats none of
the thirteen contradicted claims.

Explicitly *not* done when the pages match the audit's description. The audit is wrong about all
four programmes.

## The audit is the input, and it is unreliable here

Four independent surveys read 135 pages of the 577-page capture and checked every programme
claim. Thirteen are contradicted. The two that would have caused real damage:

- **ASA's funder.** The audit says "CCIDA-funded". CCIDA appears only from 2024; editions 2017
  through 2022/23 name **Create Hong Kong under the CreateSmart Initiative**. Publishing the
  wrong government agency as a funder is specific and checkable.
- **CPAI's ownership.** The audit calls it a "joint WTIA × CUSCS certification". The archive is
  explicit: 「一個課程，兩張認證」 — WTIA issues CPAI, CUSCS separately issues its own completion
  certificate. Calling it joint understates what WTIA owns.

Also contradicted: HKICT was organised for **OGCIO** until 2025, not the Digital Policy Office;
TCT's "10 workshops + 2 seminars" describes only the 2023 edition (2021–22 was 12 workshops);
the 2019 TechConnect conference is a same-named predecessor, not a TCT edition; and the "150+
I&T companies" and "15+ experts from Huawei, Microsoft, HKPC" figures have no source anywhere
in 577 pages.

**Treat the audit as a claim log to verify, not a source.** That is the opposite of how the
earlier sub-projects used it, and it is the single most important thing about this one.

## Options considered

**Full track records, as the audit implies.** Rejected. It needs judging criteria, entry
counts, four editions' winner lists, CPAI's fee and assessment terms, and TCT's 2024–26 funder —
none of which exist in the archive. That makes the whole sub-project depend on WTIA answering,
and they have two review documents outstanding already.

**Positioning plus outbound links.** Rejected. A paragraph and a link to the microsite ships
fastest and has no gaps to manage, but it concedes the search value entirely — which is odd
given this migration exists to preserve exactly that.

**What the archive supports.** Chosen. Editions, years, corrected funders, named winners where
they exist, outbound links where they do not. Ships without a dependency, and upgrades cleanly
when WTIA answers.

## Four schemas, not one

The four programmes are less alike than "programme page" suggests. ASA is an awards series with
numbered editions and a funder that changed. HKICT is an award WTIA co-organises for a
government body that was renamed mid-programme. **CPAI is a credential, not an event** — no
editions, no winners, no years. TCT is a series whose editions have genuinely different shapes.

A shared schema would be mostly optional fields, which is the shape that lets a missing funder
pass validation unnoticed. The milestone schema caught errors precisely because it was tight —
requiring both locales and a valid own-origin image path. Four tight schemas will catch the
funder-per-edition problem; one loose one will not.

```
content/programmes/asa.ts     editions[]: year, funder, regions, venue, winners[]
content/programmes/hkict.ts   editions[]: year, organisedFor, winners[]
content/programmes/cpai.ts    issuer, coursePartner, courseName, syllabus — no editions
content/programmes/tct.ts     editions[]: year, shape (free text), funder | null
```

**`funder` belongs to the edition, never the programme.** That is the structural fix for the
CCIDA error: there is no field in which "the funder of ASA" can be written, so the mistake
becomes unrepresentable rather than merely discouraged.

`organisedFor` on HKICT works the same way — OGCIO for 2020–2024, DPO for 2025, with no
programme-level field to collapse them into.

TCT's `shape` is free text rather than workshop and seminar counts, because the editions do not
share a structure. `funder` is nullable there and only the 2023 edition can fill it: GSP is
named exactly once in 577 pages.

## Rendering

The four routes already exist, driven by the `programs` message namespace, which staff can edit
at `/admin/page-copy`. That split is kept deliberately: **page furniture stays in the message
bundles; the factual record comes from typed content.** Staff can reword an introduction without
being able to edit a funder or a winner.

Where the archive has no winner list — ASA 2020 and 2021, HKICT 2021, 2022 and 2024 — the page
links to the microsite rather than rendering an empty table. Absence is shown as absence.

## Images

293 content images across the four (ASA 170, HKICT 61, TCT 57, CPAI 5), every one hosted on
`hkwtia.org` and dying with it. Same treatment as the milestones: download to
`public/images/programmes/`, rewrite the references, commit. Own-origin satisfies the existing
`img-src 'self' data:` CSP, which declares no remote hosts — a hotlinked image would render
nothing even while the old site is up.

Two lessons from the milestone image pass apply directly. The theme renders a "Related Posts"
carousel *inside* `<article>`, and counting it inflated the milestone image estimate by a factor
of two and a half — the extraction must exclude it. And some images lazy-load, with the real URL
in `data-orig-src` while `src` holds a blank-SVG placeholder.

## Translation

ASA's archive material is predominantly English-only; HKICT and TCT are mixed by era, not by
page. Same approach as sub-project 2a: draft the missing locale, then route the proper nouns —
award names, government agencies, company names — to WTIA as a short review list rather than
asking them to read the prose.

Government body names are the risk here. 政府資訊科技總監辦公室 (OGCIO), 數字政策辦公室 (DPO),
創意香港 (CreateHK) and 文創產業發展處 (CCIDA) must each be rendered exactly, and the archive
supplies all four.

## Invariants

- No page may state a funder, organiser or partner not evidenced in the archive.
- `funder` and `organisedFor` exist only on editions. Adding a programme-level equivalent
  reintroduces the error this design removes.
- Message bundles stay in parity; `npm run audit:strings` stays green.
- No image references a remote host.
- Locale prefixes are never hand-built — `zh-HK` is served at `/zh`.

## Known gaps: these come from WTIA or stay off the pages

Recorded so a later reader does not mistake them for oversights:

- Judging criteria, judge names, entry counts and prize values — every edition of ASA and HKICT
- Full winner lists for ASA 2020 and 2021 (off-site: `contest2020.bestasiaapp.hk`,
  `contest2021.bestasiaapp.hk`, neither captured)
- HKICT winners for 2021, 2022 and 2024
- The full 2025 ASA category structure — only "Living & Culture" is named
- What RIFFAI and 417 Technology actually built
- CPAI's fee, assessment requirements, validity period and prerequisites
- The "150+ I&T companies" figure's source
- TCT's funder for the 2024–26 editions, and any TCT landing page — the old site's navigation
  linked off to `techtoconnect.net`, which was never captured. Everything known about TCT is
  inferred from ~50 individual event listings.

## Out of scope

Leadership (2b). The photo gallery and Meet Our Members as real showcase entries (4). Anything
requiring WTIA's answers, listed above.

# WTIA programme claims — corrections needed before the programme pages are built

**For WTIA.** Alongside `docs/wtia-translation-review.md`, this is the second thing needing your
confirmation before migrated content goes live.

## Why this exists

The four programme pages on the new site (`/programs/asa`, `/cpai`, `/hkict`, `/tct`) are
currently one-line stubs. **Nothing incorrect is published today.** The claims below come from
`docs/wtia-content-migration-audit.md`, which is the input to the work that will fill those
pages — so correcting them now prevents errors rather than fixing live ones.

Four surveys read 135 pages of the captured hkwtia.org archive and checked each audit claim
against what the site actually says. Thirteen claims are contradicted by WTIA's own archive.

Two of them would attribute **government funding to the wrong agency** and describe a
**certification as jointly issued when it is not** — the kind of statement a trade association
gets held to.

---

## 1. ASA — the funder is wrong for six editions

The audit says ASA is "CCIDA-funded", as though that were the programme's funder throughout.

**CCIDA appears only from 2024 onward.** Every documented edition from 2017 through 2022/23
names **Create Hong Kong (CreateHK) under the CreateSmart Initiative**:

> "With funding support from Create Hong Kong of the Government of the Hong Kong Special
> Administrative Region"
> — 2017 Asia Smart App Summit post

Writing "CCIDA-funded" across ASA's history would misattribute six editions.

**Please confirm:** which agency funded which editions, and whether the CreateHK → CCIDA change
is a rename or a transfer between bodies.

### Also contradicted

| Audit says | Archive says |
|---|---|
| 16 regional **co-organisers** (2024) | 16 regions **attended**. Explicit co-organiser counts exist only for 2013 (7) and 2016 (9). |
| 17 regional co-organisers (2025) | The home page asserts 17, but its own Regional Partners carousel renders **15 logos**. The archive contradicts itself. |
| Rebranded to Asia Smart Innovation Awards | True, but the home page card is still headed "Asia Smart App Awards (ASA)", and one 2025 post uses two different Chinese names — 亞洲智慧創新大獎 in the title, 亞洲智能創新大獎 for the grand award. |

**Please confirm:** the co-organiser counts for 2024 and 2025, and the single correct Chinese
name for the rebranded award.

---

## 2. CPAI is not a joint certification

The audit calls CPAI a "joint WTIA × CUSCS certification". The archive is explicit that it is
not:

> 「CPAI（Certified Practitioner in GenAI）由 WTIA 頒發」…「完成課程後同時獲頒 … CUSCS 結業證書」…
> 「一個課程，兩張認證。」

**WTIA issues CPAI alone.** CUSCS separately issues its own completion certificate to the same
graduates. One course, two distinct certificates — not one joint credential.

The audit also calls CPAI a "certified course". It is a **credential awarded for completing a
course**; the course is CUSCS's *Generative AI for Business Innovation and Applications*, and
enrolment happens on CUSCS systems, not on hkwtia.org. The audit never mentions that the
subject is generative AI.

**Please confirm:** the exact wording for how CPAI and the CUSCS certificate relate, since
describing WTIA's own credential as jointly issued understates it.

### The "150+ companies" figure has no source

The audit says CPAI is "recognised by 150+ I&T companies". That number appears nowhere in the
archive — no list, no logos, no named employers, and no indication whether it is a survey, a
pledge list, or a membership count.

**Please supply:** the source of the figure, or confirm it should not be published.

---

## 3. HKICT — the government counterparty changed mid-programme

The audit says the ICT Startup Award is "organised for the Digital Policy Office".

**DPO applies only from 2025.** Every earlier year names **OGCIO (政府資訊科技總監辦公室)** — and a
June 2024 recruitment event still bills its guest of honour under the OGCIO title. For editions
2020–2024 the correct counterparty is OGCIO.

**Separately:** the audit lists the 2006 "Best Ubiquitous Award" alongside the ICT Startup
Award. These are **different award streams**. The 2006 award was renamed *Best Mobile Apps
Award* in 2013 and WTIA ran it through at least 2017; the Startup Award stream begins with the
2020 edition.

**Please confirm:** whether the new site should name OGCIO for pre-2025 editions, and whether
the Best Mobile Apps Award lineage should appear at all.

---

## 4. TCT — the structure described fits one edition, not the programme

The audit gives TCT's shape as "10 industry workshops + 2 seminars + grand conference". That
describes **only Tech to Connect 4.0 (2023)**. The first edition (2021–22) was **12 workshops**,
and the archive holds exactly 12 matching workshop pages.

**The 2019 TechConnect Conference & Festival is a different event.** It carries no "Tech to
Connect" branding, no edition number, and no link to the series site. The 2023 summit calls
Tech to Connect 4.0 the "2nd edition", which makes 2021–22 the first. 2019 is a same-named
predecessor, not edition zero.

**The AI Leaders' Summit speaker count is unresolved.** Its own event page says fifteen speakers
in one sentence and eighteen in the next, and **names none of them**. No Huawei, Microsoft or
HKPC person appears anywhere — HKPC is the venue. The audit's "15+ experts from Huawei,
Microsoft, HKPC" has no support in the archive.

**GSP funding appears once, in 577 pages** — on the July 2023 Tech to Connect 4.0 seminar page.
The 2024–26 AI and robotics editions never mention it.

**Please confirm:** the edition numbering, the funder for the 2024–26 editions, and the speaker
list for the AI Leaders' Summit.

---

## What the archive simply does not contain

These cannot be migrated because they are not there. Each must come from WTIA or be left off
the page:

- **Judging criteria, judge names, entry counts and prize values** — for every edition of both
  ASA and HKICT
- **Full winner lists for ASA 2020 and 2021** — both pages defer to off-site microsites
  (`contest2020.bestasiaapp.hk`, `contest2021.bestasiaapp.hk`) that were not captured
- **The full 2025 ASA category structure** — only "Living & Culture" is named
- **What the 2025 winners actually built** — neither RIFFAI's nor 417 Technology's product is
  described anywhere
- **HKICT winners for 2021, 2022 and 2024** — photo albums exist for two of those years, with no
  names
- **CPAI course fee, assessment requirements, validity period and prerequisites**
- **Any TCT landing page** — the site's own navigation links off-site to `techtoconnect.net`,
  which is not in the capture. Everything known about TCT is inferred from ~50 individual event
  listings.

---

## Method

Four independent surveys of `/Users/willylai/wtia-legacy-capture-20260812`, the 577-page capture
taken before hkwtia.org is switched off. 135 pages read; 293 content images catalogued. Every
finding above quotes the archive directly rather than paraphrasing.

This approach exists because earlier assumptions in this migration proved wrong when checked:
an image count was out by a factor of two and a half, and 61 posts assumed to be milestones
turned out to be three different kinds of content. Both were caught only by reading the source.

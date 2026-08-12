# WTIA Website Content Audit
## hkwtia.org (existing) → hkwtia.vercel.app/zh (new)

**Date:** 11 Aug 2026 · **Scope:** Content parity audit focused on preserving WTIA's history, major campaigns, and achievements in the new site.

---

## Executive Summary

The new site ([hkwtia.vercel.app/zh](https://hkwtia.vercel.app/zh)) is a clean 10-page bilingual shell with a strong "創新香港" positioning, working membership tiers, and a Launch Pad funding-matcher — but it currently carries **zero WTIA institutional memory**. The existing site ([hkwtia.org](https://hkwtia.org/)) holds 25 years of history: the 2001 founding, ~45 milestone posts (2001–2025), flagship award programmes with real winners, government advocacy work, leadership rosters, and a 20+1 anniversary commemorative book. None of this has been migrated.

**Highest-risk issues:**
1. The new site's Showcase, News, Events, and Launch Pad cohort pages contain content explicitly labelled 「虛構示範」(fictional demo). Going live with these would damage credibility.
2. The About page has no founding year, no mission, no history, no people.
3. Programme pages (ASA / CPAI / HKICT / TCT) are stubs with no editions, years, winners, or track record — the strongest proof of WTIA's credibility.

---

## Site Structure Comparison

| Existing site (hkwtia.org) | New site (hkwtia.vercel.app/zh) | Status |
|---|---|---|
| About Us (est. 2001, mission, 6 CFGs) | /zh/about (generic value props) | ⚠️ History lost |
| Chairman's Message (Keith Li) | — | ❌ Missing |
| Executive Committee (2022–2026 roster) | — | ❌ Missing |
| Honorary Chairman (4 named) | — | ❌ Missing |
| Core Focus Groups (6 CFGs) | — | ❌ Missing |
| Special Task Force | — | ❌ Missing (partly "Coming Soon" on old site) |
| ~45 milestone posts, 2001–2025 | — | ❌ Missing — this IS the history archive |
| Photo Gallery (2020–2026 events) | — | ❌ Missing |
| News + Media Coverage / Press Releases | /zh/news (1 demo item) | ⚠️ Demo placeholder |
| Meet Our Members interview series | /zh/showcase (3 fictional demos) | ⚠️ Demo placeholder |
| Become a Member (annual, Platinum, bespoke) | /zh/membership (Free / $1,200 / $1,800 / Patron) | ⚠️ New model — confirm intentional |
| Certified Courses (CPAI detail) | /zh/programs/cpai (stub) | ⚠️ Detail lost |
| Upcoming Events (Tribe Events) | /zh/events (1 demo event) | ⚠️ Demo placeholder |
| Constitution / Job Board / STEM Internship / WTIA Career | — | ❌ Missing (P2) |
| Contact Us | /zh/contact | ✅ Parity (email, phone, KOHO address match) |
| — | /zh/launchpad (funding matcher, BUD etc.) | ✅ New capability (verify data sources) |

---

## P0 — Must Preserve Before Launch

### 1. Founding & Mission (→ /zh/about)
From [hkwtia.org/about-us](https://hkwtia.org/about-us/):
- **Established 2001**, not-for-profit trade association for the wireless/mobile/emerging-tech community.
- Mission: platform, aggregator and community — advance wireless, mobile and emerging technologies; accelerate real-world adoption; shape Hong Kong into a top-class innovation & technology hub.
- The new About page currently has neither the founding year nor any mission statement.

### 2. Historical Milestone Timeline (→ new /zh/about#history or /zh/history)
The old site's post archive is effectively WTIA's 25-year timeline. Key entries to migrate ([post sitemap](https://hkwtia.org/post-sitemap.xml)):

| Year | Milestone |
|---|---|
| 2001 | Establishment of WTIA |
| 2002 | 1st WTIA Panel Discussion — Inter-Operator SMS |
| 2003 | 1st WTIA Awards (J2ME Open); Opening of HK Wireless Development Centre at Cyberport; WLAN "war driving" study with PISA |
| 2005 | 1st SMS Donation Campaign; 3G Cyberport Project; 1st HK Wireless Technology Excellence Awards; HK International Wireless Conference; WSVCC platform |
| 2006 | HK ICT Awards — Best Ubiquitous Award |
| 2007 | Hong Kong Mobile Film Festival |
| 2013 | Mobility Experience Centre at Cyberport; Asia Smartphone Contest |
| 2014 | **Wi-Fi.HK** launch; Made in Hong Kong Smartphone Apps Project |
| 2015 | **SafeWiFi Campaign**; 5th HK International Mobile Film Festival; Asia Smartphone Apps Contest & Summit; HKICT Best Mobile Apps Award |
| 2016 | SafeWiFi Campaign; Wi-Fi.HK Pledging Ceremony; LegCo IT Constituency Election Forum; Asia Smartphone Apps Summit |
| 2017 | IoV (Internet of Vehicles) market network in Mainland China; Connected City Conference; Asia Smart App Summit |
| 2018 | Y Combinator session with Eric Migicovsky; Taipei IoT Business Delegation Tour |
| 2019 | Asia Smart App Awards 2018/19; 5G Revolution seminar; TechConnect Conference & Festival; Joint ICT Spring Dinner |
| 2020 | HKICT ICT Startup Award; ASA 2020; COVID-era industry advocacy |
| 2021 | SIM card real-name registration advocacy; Innovation & Technology Festival (primary + secondary students) |
| 2022 | **20+1st Anniversary Gala Dinner & Commemorative Book**; new ExCo term 2022–2024 |
| 2025 | Asia Smart Innovation Awards 2025 (largest edition, 17 regions); HKICT Startup Award 2025; Tech Connect AI Leaders Seminar Series |

### 3. Programme Track Records (→ /zh/programs/*)
Each programme stub should carry its history and outcomes:

- **ASA** — 10th edition in 2024, CCIDA-funded, 16 regional co-organisers ([hkwtia.org](https://hkwtia.org/)). Rebranded **Asia Smart Innovation Awards 2025**: 17 regions (largest ever), grand winner RIFFAI (Thailand), HK's 417 Technology Limited won Silver in Life & Culture; ceremony 16 Oct at Cordis Hong Kong ([news](https://hkwtia.org/news/)).
- **HKICT Startup Award** — organised for the Digital Policy Office; 2025 Grand Award: Entoptica Limited (SLOPE device, medtech breakthrough) ([news](https://hkwtia.org/news/)). Track record since at least 2020.
- **CPAI** — joint WTIA × CUSCS certification; recognised by 150+ I&T companies; includes 1-year WTIA Community Network individual membership and 10% course discount ([certified-courses](https://hkwtia.org/certified-courses/)). None of this detail is on the new stub.
- **TCT (Tech Connect)** — General Support Programme-funded; 10 industry workshops + 2 seminars + grand conference; AI Leaders' Summit drew 15+ experts from Huawei, Microsoft, HKPC ([news](https://hkwtia.org/news/)).

### 4. Remove All Fictional Demo Content
Explicitly labelled 「虛構示範」on the new site — must be replaced or hidden before launch:
- /zh/showcase — 3 fictional member showcases
- /zh/news — "WTIA 公開旅程" demo post
- /zh/events — "WTIA 全球增長示範簡介會" (3 Sep 2026)
- /zh/launchpad — "WTIA 全球增長示範組" cohort (24 seats, HK$0)

---

## P1 — Strongly Recommended

### 5. Leadership & Governance (→ /zh/about)
- **Chairman's Message** — Keith Li's message: 20-year journey, "super-connector" positioning, two pillars (technology promotion + talent cultivation), I&T Festival, Web3.0 & Metaverse task force, InsideW magazine ([chairmans-message](https://hkwtia.org/chairmans-message/)).
- **Executive Committee** — Keith Li (Chairman 2022–2026, Innopage), Donald Chan (Vice-Chairman, Cherrypicks), Dr. Lawrence Cheung (Vice-Chairman, HKPC), Nelson Tse (Treasurer, Million Tech) ([executive-committee](https://hkwtia.org/executive-committee/)).
- **Honorary Chairmen** — John Chiu (ATG Holdings), Ken Fong (Synergy Pacific), To Cheung (UDomain), Kenny Yiu (Fimmick) ([honorary-chairman](https://hkwtia.org/honorary-chairman/)).
- **6 Core Focus Groups** — StartUp; FinTech & e-Commerce; EduTech; Blockchain/Web3/Metaverse; 5G & IoT; Mobile Security/InfoSec ([core-focus-groups](https://hkwtia.org/core-focus-groups/)).

### 6. Advocacy & Public-Voice Record (→ /zh/news archive)
The new site's tagline promises "為無線科技業界建立清晰而共同的聲音" — the old site has the proof:
- SIM card real-name registration position paper (2021)
- COVID-19 SME/startup relief advocacy with LegCo (Apr 2020)
- LegCo IT Constituency Election Forum (2016)
- Extensive media coverage 2021–22: 明報, 星島, 大公報, HK01, RTHK, etc. ([media coverage](https://hkwtia.org/media-coverage-press-release/))

### 7. Event & Photo Archive (→ /zh/events past-events or gallery)
The [photo gallery](https://hkwtia.org/photo-gallery/) documents every flagship event 2020–2026, including Tech To Connect 2026 Robotics & Automation Kick-off, ASIA 2025 Shanghai Delegation Trip, and AI+ Power 2025 Tech Conference. Even a curated selection would anchor the new site in reality.

### 8. 20+1 Anniversary Commemorative Book
Available online per the old site — link or embed it on the new About/History page as the single richest history asset ([20+1 anniversary post](https://hkwtia.org/2022/10/wtia-201st-anniversary-commemorative-book-%e9%a6%99%e6%b8%af%e7%84%a1%e7%b7%9a%e7%a7%91%e6%8a%80%e5%95%86%e6%9c%8320%ef%bc%8b1%e9%80%b1%e5%b9%b4%e7%b4%80%e5%bf%b5%e7%89%b9%e5%88%8a/)).

---

## P2 — Evaluate Case by Case

- **Meet Our Members series** (Yahoo HK, Mtel, FinFabrik, Playnote, Pixel Networks, Vpon, Rohde & Schwarz, Cypher Martin) — could be relaunched as real content for /zh/showcase, replacing the fictional demos with genuine member stories.
- **Constitution, Job Board, STEM Internship Scheme, WTIA Career** — decide whether these remain on the legacy site or migrate.
- **Membership model change** — old: annual fee, Platinum tier, bespoke partnership contracts; new: Free / HK$1,200 (startup, HK$120 monthly option) / HK$1,800 (corporate) / Patron by approval. Confirm this repositioning is intentional and that existing (Platinum) members have a mapped migration path.
- **Launch Pad funding data** — BUD figures (48 economies from 15 Jun 2026, HK$7M cap, E-commerce Easy HK$1M, EMF merged 1 Jul 2026) show 資料日期 2026-07-27 but list no official sources. Add source links (HKPC BUD, ITF) to each scheme card.

---

## Suggested Implementation Order

1. **Purge/replace demo content** (P0.4) — showcase, news, events, launchpad cohort.
2. **Rebuild /zh/about** with founding year, mission, history timeline (P0.1–0.2), leadership (P1.5).
3. **Enrich the 4 programme pages** with editions, funders, and 2024–25 winners (P0.3).
4. **Seed /zh/news** with 5–8 real items: ASIA 2025, HKICT 2025, Tech Connect AI series, 20+1 anniversary, advocacy work (P1.6).
5. **Convert Meet Our Members into real showcase entries** (P2).
6. **Resolve membership tier migration** and add Launch Pad source links (P2).

---

*Extraction notes: hkwtia.org intermittently returns Cloudflare 520 errors — pages were retrieved on retry. Full page extracts saved to `old_site_pages.json`, `old_site_pages_retry.json`, and `new_site_pages.json` in the workspace for reference.*

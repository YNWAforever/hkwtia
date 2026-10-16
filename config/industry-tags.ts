/**
 * S-4: the controlled vocabulary a public member profile may be tagged with.
 *
 * The directory's `?tag=` predicate is `companies.tags @> ARRAY['ai']`, so a
 * tag only ever matches when both sides spell it the same way. Free text made
 * that impossible on /events (a row tagged "AI" was unreachable from `?tag=ai`,
 * fixed by `normaliseEventTag`); the member directory never accepts free text
 * at all — the portal renders checkboxes from this list and the repository
 * rejects anything absent from it.
 *
 * Adding a tag is additive and safe. Renaming or removing a slug orphans the
 * rows already carrying it, so treat the slugs as data, not labels: change the
 * `en`/`zhHk` wording freely, and leave the slug alone.
 */
export type IndustryTag = Readonly<{slug: string; en: string; zhHk: string}>;

const tag = (slug: string, en: string, zhHk: string): IndustryTag => Object.freeze({slug, en, zhHk});

export const INDUSTRY_TAGS: readonly IndustryTag[] = Object.freeze([
  tag("ai", "Artificial intelligence", "人工智能"),
  tag("iot", "Internet of Things", "物聯網"),
  tag("5g", "5G and telecoms", "5G 及電訊"),
  tag("fintech", "FinTech", "金融科技"),
  tag("healthtech", "HealthTech", "醫療科技"),
  tag("edtech", "EdTech", "教育科技"),
  tag("proptech", "PropTech", "地產科技"),
  tag("logistics", "Logistics and supply chain", "物流及供應鏈"),
  tag("smart-city", "Smart city", "智慧城市"),
  tag("cybersecurity", "Cybersecurity", "網絡安全"),
  tag("cloud", "Cloud and infrastructure", "雲端及基建"),
  tag("data", "Data and analytics", "數據及分析"),
  tag("robotics", "Robotics and automation", "機械人及自動化"),
  tag("hardware", "Hardware and devices", "硬件及裝置"),
  tag("mobile-apps", "Mobile apps", "流動應用"),
  tag("gaming", "Gaming and media", "遊戲及媒體"),
  tag("ecommerce", "E-commerce and retail tech", "電商及零售科技"),
  tag("greentech", "GreenTech", "綠色科技"),
  tag("govtech", "GovTech and public sector", "政府科技及公營"),
  tag("consulting", "Consulting and integration", "顧問及系統整合"),
  tag("investor", "Investor and accelerator", "投資者及加速器"),
  tag("academia", "Academia and research", "學術及研究"),
  tag("gba", "Greater Bay Area", "大灣區"),
  tag("web3", "Web3 and blockchain", "Web3 及區塊鏈"),
]);

const slugs = new Set(INDUSTRY_TAGS.map((entry) => entry.slug));

export function isIndustryTag(value: string): boolean {
  return slugs.has(value);
}

/** The slug itself for anything unknown: a row tagged before a slug was retired still renders. */
export function industryTagLabel(slug: string, locale: "en" | "zh-HK"): string {
  const entry = INDUSTRY_TAGS.find((item) => item.slug === slug);
  return entry ? (locale === "zh-HK" ? entry.zhHk : entry.en) : slug;
}

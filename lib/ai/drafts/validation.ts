import "server-only";
import { createHash } from "node:crypto";
import { canonicalHttpsUrl } from "@/lib/security/https-url";
import { hongKongEffectiveDate } from "@/lib/ai/knowledge/policy";
import {
  approvedFactPackSchema,
  groundedContentSchema,
  adminAiDraftSchema,
  type ApprovedFactPack,
  type GroundedContent,
  type AdminAiDraft,
  type DraftValidation,
  type DraftViolation,
} from "./contracts";
const factToken = /\{\{facts\.([a-z][a-zA-Z0-9_.-]{0,63})\}\}/gu;
const unsafeSyntax =
  /<\/?[a-z][^>]*>|(?:javascript|data|vbscript|file|blob)\s*:|(?:^|[\s(])\/\/|\[INST\]|<\|(?:system|assistant|user)|\b(?:SYSTEM|DEVELOPER)\s*:|ignore\s+(?:all|previous|the)\s+(?:rules|instructions)|忽略.{0,8}(?:規則|指令)|無視.{0,8}(?:規則|指令)/iu;
const effectPromise =
  /\b(?:membership|application|refund|payment)\s+(?:is|was|has been|will be)\s+(?:approved|activated|issued|sent|processed|refunded)|\b(?:we|I)\s+(?:have\s+)?(?:approved|activated|refunded|sent|published)\b|(?:已|將會|即將)(?:批准|啟用|退款|發送|發布)|(?:會籍|申請).{0,4}(?:獲批|啟用)|退款.{0,4}(?:已發出|完成)/iu;
const criticalWords =
  /\b(?:fee|fees|price|prices|cost|costs|capacity|deadline|deadlines|eligible|eligibility|approval|refund|refunded|payment|paid|balance|due date|growth|grew|increase|decrease)\b|會費|費用|金額|容量|名額|截止|限期|資格|獲批|退款|已付款|增長|增幅/iu;
const rawNumeric =
  /\p{Nd}|[$€£¥￥%％]|\b(?:HKD|USD|GBP|EUR)\b|[零〇一二三四五六七八九十百千萬億兩]+(?=[元蚊日月年人位張%％])|百分之[零〇一二三四五六七八九十百千萬億兩]/u;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
/** Wall-clock read time is not a version. All authoritative values, rendering metadata, source identities and comparison availability are. */
export function approvedFactsHash(facts: ApprovedFactPack): string {
  const { versionHash: unusedHash, asOf: unusedClock, ...versioned } = facts;
  void unusedHash;
  void unusedClock;
  return createHash("sha256")
    .update(
      canonical({
        ...versioned,
        sourceRefs: [...facts.sourceRefs].sort((a, b) =>
          canonical(a).localeCompare(canonical(b)),
        ),
      }),
    )
    .digest("hex");
}
function factDisplay(field: string, facts: ApprovedFactPack): string {
  const fact = facts.values[field];
  if (!fact) throw Error("DRAFT_FACT_UNKNOWN");
  let value: string;
  switch (fact.format) {
    case "money":
      if (
        typeof fact.value !== "number" ||
        !fact.currency ||
        !Number.isSafeInteger(Math.round(fact.value * 100)) ||
        Math.round(fact.value * 100) / 100 !== fact.value
      )
        throw Error("DRAFT_FACT_FORMAT");
      value = new Intl.NumberFormat(facts.locale, {
        style: "currency",
        currency: fact.currency,
        currencyDisplay: "symbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(fact.value);
      break;
    case "datetime":
      if(typeof fact.value!=="string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(fact.value) || !Number.isFinite(new Date(fact.value).getTime()))throw Error("DRAFT_FACT_FORMAT");
      value = new Intl.DateTimeFormat(facts.locale, {dateStyle:"long",timeStyle:"short",timeZone:"Asia/Hong_Kong"}).format(new Date(fact.value));
      break;
    case "date":
      if (typeof fact.value !== "string") throw Error("DRAFT_FACT_FORMAT");
      hongKongEffectiveDate(fact.value);
      value = fact.value;
      break;
    case "count":
      if (typeof fact.value !== "number" || !Number.isSafeInteger(fact.value))
        throw Error("DRAFT_FACT_FORMAT");
      value = new Intl.NumberFormat(facts.locale).format(fact.value);
      break;
    case "percent":
      if (
        typeof fact.value !== "number" ||
        !Number.isSafeInteger(Math.round(fact.value * 10000)) ||
        Math.round(fact.value * 10000) / 10000 !== fact.value
      )
        throw Error("DRAFT_FACT_FORMAT");
      value = new Intl.NumberFormat(facts.locale, {
        style: "percent",
        maximumFractionDigits: 2,
      }).format(fact.value);
      break;
    case "boolean":
      if (typeof fact.value !== "boolean") throw Error("DRAFT_FACT_FORMAT");
      value = fact.value ? facts.displayLabels.yes : facts.displayLabels.no;
      break;
    default:
      if (typeof fact.value !== "string" && fact.value !== null)
        throw Error("DRAFT_FACT_FORMAT");
      value = fact.value ?? facts.displayLabels.notAvailable;
  }
  return `${fact.label}: ${value}`;
}
/** The placeholder expands a whole server-labelled fact, never a bare value that can be relabelled as another field by the model. */
export function renderGroundedBody(
  body: string,
  facts: ApprovedFactPack,
): string {
  return body.replace(factToken, (_token, field: string) =>
    factDisplay(field, facts),
  );
}
function refKey(ref: ApprovedFactPack["sourceRefs"][number]): string {
  return canonical(ref);
}
function urlCanonical(input: string): string {
  const value = canonicalHttpsUrl(input, { allowQuery: true });
  if (new URL(value).hash) throw Error("DRAFT_URL_FRAGMENT");
  return value;
}
export function validateGroundedContent(
  input: GroundedContent,
  factsInput: ApprovedFactPack,
): DraftValidation {
  const content = groundedContentSchema.safeParse(input),
    parsed = approvedFactPackSchema.safeParse(factsInput);
  const violations: DraftViolation[] = [];
  const reject = (field: string, code: string) => {
    if (!violations.some((v) => v.field === field && v.code === code))
      violations.push({ field, code });
  };
  if (!content.success || !parsed.success)
    return {
      valid: false,
      violations: [{ field: "body", code: "INVALID_DRAFT_CONTRACT" }],
    };
  const facts = parsed.data,
    body = content.data.body;
  if (approvedFactsHash(facts) !== facts.versionHash)
    reject("factsHash", "FACTS_HASH_INVALID");
  const at = new Date(facts.asOf).getTime();
  const approvedRefs = new Set(facts.sourceRefs.map(refKey));
  for (const ref of [...facts.sourceRefs, ...content.data.sourceRefs]) {
    if (
      ref.locale !== facts.locale ||
      new Date(ref.effectiveFrom).getTime() > at ||
      (ref.effectiveTo !== null && new Date(ref.effectiveTo).getTime() <= at)
    )
      reject("sourceRefs", "SOURCE_NOT_CURRENT");
  }
  for (const ref of content.data.sourceRefs)
    if (!approvedRefs.has(refKey(ref))) reject("sourceRefs", "SOURCE_CHANGED");
  const claimByField = new Map<string, GroundedContent["claims"][number]>();
  for (const claim of content.data.claims) {
    const fact = facts.values[claim.field];
    if (claimByField.has(claim.field)) reject(claim.field, "DUPLICATE_CLAIM");
    claimByField.set(claim.field, claim);
    if (
      !fact ||
      claim.sourceId !== fact.sourceId ||
      !Object.is(claim.value, fact.value)
    )
      reject(claim.field, "CLAIM_NOT_APPROVED");
  }
  for (const line of body.split(/\r?\n/u)) {
    if (
      line.includes("{{facts.") &&
      !/^\s*\{\{facts\.[a-z][a-zA-Z0-9_.-]{0,63}\}\}\s*$/u.test(line)
    )
      reject("body", "FACT_BLOCK_RELABELLED");
  }
  const raw = body.replace(factToken, (_token, field: string) => {
    const fact = facts.values[field];
    if (!fact) {
      reject(field, "FACT_UNKNOWN");
      return "";
    }
    if (
      facts.comparisonAvailable !== true &&
      /growth|increase|decrease|change(?:Percent|Rate)|同比|增長|增幅|增加|減少|變動/iu.test(
        `${field} ${fact.label}`,
      )
    )
      reject(field, "COMPARISON_MISSING");
    const claim = claimByField.get(field);
    if (
      !claim ||
      claim.sourceId !== fact.sourceId ||
      !Object.is(claim.value, fact.value)
    )
      reject(field, "FACT_NOT_CLAIMED");
    if (
      !facts.recordSources[fact.sourceId] &&
      (!facts.sourceRefs.some((ref) => ref.sourceId === fact.sourceId) ||
        !content.data.sourceRefs.some((ref) => ref.sourceId === fact.sourceId))
    )
      reject(field, "SOURCE_MISSING");
    return "";
  });
  if (/^(?:event|news):[a-f0-9-]{36}:(?:en|zh-HK)$/.test(facts.caseId)) {
    const required = facts.caseId.startsWith("event:") ? ["title","startsAt","endsAt","venue","capacity","registrationMode","ticketPrice"] : ["title"];
    for(const field of required) if(!body.includes("{{facts."+field+"}}")) reject(field,"CONTENT_FACT_MISSING");
    if(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifty|hundred|thousand|million|guaranteed|award|entitlement|benefits?|WTIA|HKWTIA)\b|獲獎|獲得獎|權益|保證|香港無線科技商會/iu.test(raw))reject("body","CONTENT_UNAPPROVED_CLAIM");
    if(facts.locale==="zh-HK" && !/\p{Script=Han}/u.test(raw))reject("body","CONTENT_LOCALE_MISMATCH");
  }
  if (/[{}]/u.test(raw)) reject("body", "UNRESOLVED_OR_EXECUTABLE_TOKEN");
  if (unsafeSyntax.test(body) || effectPromise.test(raw))
    reject("body", "UNSAFE_CONTENT");
  const allowedUrls = new Set<string>();
  for (const sourceUrl of Object.values(facts.sourceUrls)) {
    try {
      allowedUrls.add(urlCanonical(sourceUrl));
    } catch {
      reject("sourceUrls", "URL_NOT_APPROVED");
    }
  }
  const withoutUrls = raw.replace(/https?:\/\/[^\s<>"\])]+/giu, (url) => {
    try {
      if (!allowedUrls.has(urlCanonical(url)))
        reject("body", "URL_NOT_APPROVED");
    } catch {
      reject("body", "URL_NOT_APPROVED");
    }
    return "";
  });
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/u.test(withoutUrls)) reject("body", "UNBOUND_PERSONAL_CONTACT");
  if (rawNumeric.test(withoutUrls)) reject("body", "UNBOUND_CRITICAL_FACT");
  if (criticalWords.test(withoutUrls)) reject("body", "UNBOUND_FACT_LABEL");
  if (
    facts.comparisonAvailable !== true &&
    /growth|grew|increase|decrease|增長|增幅|增加|減少/iu.test(raw)
  )
    reject("body", "COMPARISON_MISSING");
  try {
    const rendered = renderGroundedBody(body, facts);
    for (const matched of rendered.matchAll(/https?:\/\/[^\s<>"\])]+/giu)) {
      try {
        if (!allowedUrls.has(urlCanonical(matched[0])))
          reject("body", "FINAL_URL_NOT_APPROVED");
      } catch {
        reject("body", "FINAL_URL_NOT_APPROVED");
      }
    }
    if (
      rendered.length > 20000 ||
      unsafeSyntax.test(rendered) ||
      /[{}]/u.test(rendered)
    )
      reject("body", "FINAL_BODY_UNSAFE");
  } catch {
    reject("body", "FACT_RENDERING_INVALID");
  }
  return { valid: violations.length === 0, violations };
}
export function validateDraft(
  input: AdminAiDraft,
  facts: ApprovedFactPack,
): DraftValidation {
  const parsed = adminAiDraftSchema.safeParse(input);
  if (!parsed.success)
    return {
      valid: false,
      violations: [{ field: "draft", code: "INVALID_DRAFT_CONTRACT" }],
    };
  const result = validateGroundedContent(
    {
      body: parsed.data.body,
      claims: parsed.data.claims,
      sourceRefs: parsed.data.sourceRefs,
    },
    facts,
  );
  const violations = [...result.violations];
  if (input.caseId !== facts.caseId)
    violations.push({ field: "caseId", code: "CASE_CHANGED" });
  if (input.factsHash !== facts.versionHash)
    violations.push({ field: "factsHash", code: "FACTS_CHANGED" });
  return { valid: violations.length === 0, violations };
}

/** Claims are derived from the whole fact tokens and trusted reader, never from model-reported assertions. Unknown tokens remain validation violations. */
export function claimsForGroundedTemplate(
  body: string,
  facts: ApprovedFactPack,
): GroundedContent["claims"] {
  const fields = [
    ...new Set([...body.matchAll(factToken)].map((match) => match[1])),
  ];
  return fields
    .filter((field) => Object.hasOwn(facts.values, field))
    .map((field) => ({
      field,
      value: facts.values[field].value,
      sourceId: facts.values[field].sourceId,
    }));
}

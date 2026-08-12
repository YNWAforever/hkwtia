import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {Pool} from "pg";

import {assertIsolatedSeedEnvironment} from "./lib/acceptance-guard.ts";
import {
  FUNDING_SCHEMES,
  FUNDING_VERIFY_CURRENT_TERMS,
  type FundingLocale,
} from "../config/funding-schemes.ts";
import {
  EMBEDDING_DIMENSIONS,
  createOpenAIEmbeddingAdapter,
  type EmbeddingAdapter,
} from "../lib/ai/embeddings.ts";
import {
  createKbDocumentsRepositoryForDatabaseUrl,
  type KbDocumentInput,
  type KbDocumentsRepository,
} from "../lib/db/repos/kb-documents.ts";

export const M4A_KB_NAMESPACE = "m4a-core-v1" as const;

const ACCEPTANCE_MEMBER_ID = "m4a-acceptance-member";
const ACCEPTANCE_CLOCK = "2026-07-28T04:00:00.000Z";

export const M4A_ACCEPTANCE_FIXTURE = Object.freeze({
  namespace: M4A_KB_NAMESPACE,
  member: Object.freeze({
    id: ACCEPTANCE_MEMBER_ID,
    authUserId: "m4a-acceptance-auth-member",
    email: "member@m4a.example.test",
    displayName: "M4A Acceptance Member",
    locale: "en" as const,
  }),
  events: Object.freeze([
    Object.freeze({
      id: "44000001-0000-4000-8000-000000000001",
      slug: "m4a-innovation-exchange",
      titleEn: "WTIA Innovation Exchange",
      titleZh: "WTIA 創科交流會",
      descriptionEn: "A published bilingual M4A acceptance event.",
      descriptionZh: "已發布的雙語 M4A 驗收活動。",
      startsAt: "2026-09-08T10:00:00.000Z",
      endsAt: "2026-09-08T12:00:00.000Z",
      venue: "Hong Kong",
      memberOnly: false,
      published: true,
    }),
    Object.freeze({
      id: "44000001-0000-4000-8000-000000000002",
      slug: "m4a-member-ai-clinic",
      titleEn: "WTIA Member AI Clinic",
      titleZh: "WTIA 會員 AI 諮詢站",
      descriptionEn: "A published member event for the Concierge fixture.",
      descriptionZh: "供 Concierge 固定測試使用的已發布會員活動。",
      startsAt: "2026-10-15T06:00:00.000Z",
      endsAt: "2026-10-15T08:00:00.000Z",
      venue: "Hong Kong",
      memberOnly: true,
      published: true,
    }),
  ]),
  cleanup: Object.freeze({
    approvalActionType: "agent.draft_email",
    taskKinds: Object.freeze([
      "concierge_general_follow_up",
      "concierge_escalation",
    ]),
  }),
  updatedAt: ACCEPTANCE_CLOCK,
});

export type M4AAcceptanceFixture = typeof M4A_ACCEPTANCE_FIXTURE;

export type M4AAcceptanceFixtureRepository = Readonly<{
  reconcile: (fixture: M4AAcceptanceFixture) => Promise<void>;
}>;

type SeedConnection = Readonly<{
  query: (
    text: string,
    values?: readonly unknown[],
  ) => Promise<unknown>;
  release: () => void;
}>;

export type M4ASeedPool = Readonly<{
  connect: () => Promise<SeedConnection>;
}>;

export async function reconcileM4AAcceptanceFixture(
  repository: M4AAcceptanceFixtureRepository,
): Promise<void> {
  await repository.reconcile(M4A_ACCEPTANCE_FIXTURE);
}

export function createM4AAcceptanceFixtureRepository(
  pool: M4ASeedPool,
): M4AAcceptanceFixtureRepository {
  return Object.freeze({
    async reconcile(fixture) {
      const connection = await pool.connect();
      try {
        await connection.query("BEGIN");
        await connection.query(
          "SELECT pg_advisory_xact_lock(hashtext($1))",
          ["hkwtia:m4a-acceptance-seed"],
        );
        await connection.query(
          `DELETE FROM approvals
           WHERE requested_by_profile_id = $1
             AND action_type = $2`,
          [fixture.member.id, fixture.cleanup.approvalActionType],
        );
        await connection.query(
          `DELETE FROM staff_tasks
           WHERE profile_id = $1
             AND kind = ANY($2::text[])`,
          [fixture.member.id, fixture.cleanup.taskKinds],
        );
        await connection.query(
          `INSERT INTO profiles
             (id, auth_user_id, email, role, consent_marketing, interests,
              display_name, phone, job_title, locale, onboarding_state,
              directory_visible, whatsapp_opt_in, whatsapp_number,
              created_at, updated_at)
           VALUES
             ($1, $2, $3, 'member', false, ARRAY['m4a-fixture']::text[],
              $4, NULL, 'M4A Acceptance Member', $5, 'complete',
              false, true, '+85290000000', $6, $6)
           ON CONFLICT (id) DO UPDATE SET
             auth_user_id = EXCLUDED.auth_user_id,
             email = EXCLUDED.email,
             role = EXCLUDED.role,
             consent_marketing = EXCLUDED.consent_marketing,
             interests = EXCLUDED.interests,
             display_name = EXCLUDED.display_name,
             phone = EXCLUDED.phone,
             job_title = EXCLUDED.job_title,
             locale = EXCLUDED.locale,
             onboarding_state = EXCLUDED.onboarding_state,
             directory_visible = EXCLUDED.directory_visible,
             whatsapp_opt_in = EXCLUDED.whatsapp_opt_in,
             whatsapp_number = EXCLUDED.whatsapp_number,
             updated_at = EXCLUDED.updated_at`,
          [
            fixture.member.id,
            fixture.member.authUserId,
            fixture.member.email,
            fixture.member.displayName,
            fixture.member.locale,
            fixture.updatedAt,
          ],
        );
        for (const event of fixture.events) {
          await connection.query(
            `INSERT INTO events
               (id, slug, title_en, title_zh, description_en, description_zh,
                starts_at, ends_at, venue, capacity, member_only, published,
                created_at, updated_at)
             VALUES
               ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, $11, $12, $12)
             ON CONFLICT (id) DO UPDATE SET
               slug = EXCLUDED.slug,
               title_en = EXCLUDED.title_en,
               title_zh = EXCLUDED.title_zh,
               description_en = EXCLUDED.description_en,
               description_zh = EXCLUDED.description_zh,
               starts_at = EXCLUDED.starts_at,
               ends_at = EXCLUDED.ends_at,
               venue = EXCLUDED.venue,
               capacity = EXCLUDED.capacity,
               member_only = EXCLUDED.member_only,
               published = EXCLUDED.published,
               updated_at = EXCLUDED.updated_at`,
            [
              event.id,
              event.slug,
              event.titleEn,
              event.titleZh,
              event.descriptionEn,
              event.descriptionZh,
              event.startsAt,
              event.endsAt,
              event.venue,
              event.memberOnly,
              event.published,
              fixture.updatedAt,
            ],
          );
        }
        await connection.query("COMMIT");
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      } finally {
        connection.release();
      }
    },
  });
}

export type KnowledgeMarkdownSource = Readonly<{
  locale: FundingLocale;
  url: string;
  markdown: string;
}>;

type KnowledgeChunk = Omit<KbDocumentInput, "embedding" | "namespace">;

function hash32(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function deterministicUuid(value: string): string {
  const hex = [
    hash32(value, 0x811c9dc5),
    hash32(value, 0x9e3779b9),
    hash32(value, 0x85ebca6b),
    hash32(value, 0xc2b2ae35),
  ].map((part) => part.toString(16).padStart(8, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${((Number.parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80)
      .toString(16).padStart(2, "0")}${hex.slice(18, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function canonicalHttpsUrl(value: string): string {
  if (value !== value.trim()) throw new Error("M4A_SOURCE_URL_INVALID");
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.toString() !== value
  ) {
    throw new Error("M4A_SOURCE_URL_INVALID");
  }
  return value;
}

export function parseKnowledgeMarkdown(
  source: KnowledgeMarkdownSource,
): readonly KnowledgeChunk[] {
  if (source.locale !== "en" && source.locale !== "zh-HK") {
    throw new Error("M4A_SOURCE_LOCALE_INVALID");
  }
  const url = canonicalHttpsUrl(source.url);
  const lines = source.markdown.replaceAll("\r\n", "\n").split("\n");
  let documentTitle = "";
  let sectionTitle = "";
  let body: string[] = [];
  const sections: Array<{title: string; content: string}> = [];
  const flush = () => {
    const content = body.join("\n").trim();
    if (content) {
      sections.push({
        title: sectionTitle || documentTitle,
        content,
      });
    }
    body = [];
  };
  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!heading) {
      body.push(line);
      continue;
    }
    const level = heading[1]!.length;
    const title = heading[2]!.trim();
    if (level === 1 && !documentTitle) {
      documentTitle = title;
      sectionTitle = title;
      continue;
    }
    flush();
    sectionTitle = title;
  }
  flush();
  if (!documentTitle || !sections.length) {
    throw new Error("M4A_MARKDOWN_INVALID");
  }
  return Object.freeze(sections.map((section, chunkIndex) => {
    const title = section.title === documentTitle
      ? documentTitle
      : `${documentTitle} — ${section.title}`;
    const identity = [
      M4A_KB_NAMESPACE,
      source.locale,
      url,
      String(chunkIndex),
      title,
      section.content,
    ].join("\n");
    return Object.freeze({
      id: deterministicUuid(identity),
      locale: source.locale,
      title,
      url,
      content: section.content,
      metadata: Object.freeze({
        source: "markdown",
        section: section.title,
        chunkIndex,
      }),
    });
  }));
}

export async function buildM4ASeedDocuments(
  sources: readonly KnowledgeMarkdownSource[],
  embedding: EmbeddingAdapter,
): Promise<readonly KbDocumentInput[]> {
  if (embedding.dimensions !== EMBEDDING_DIMENSIONS) {
    throw new Error("M4A_EMBEDDING_DIMENSIONS_INVALID");
  }
  const chunks = sources.flatMap((source) =>
    parseKnowledgeMarkdown(source)
  ).sort((left, right) => left.id.localeCompare(right.id));
  const ids = new Set<string>();
  const documents: KbDocumentInput[] = [];
  for (const chunk of chunks) {
    if (ids.has(chunk.id)) throw new Error("M4A_CHUNK_ID_DUPLICATE");
    ids.add(chunk.id);
    const vector = await embedding.embed(
      `${chunk.title}\n\n${chunk.content}`,
    );
    if (
      vector.length !== EMBEDDING_DIMENSIONS ||
      vector.some((value) => !Number.isFinite(value))
    ) {
      throw new Error("M4A_EMBEDDING_INVALID");
    }
    documents.push(Object.freeze({
      ...chunk,
      namespace: M4A_KB_NAMESPACE,
      embedding: Object.freeze([...vector]),
    }));
  }
  return Object.freeze(documents);
}

export const M4A_FUNDING_SOURCES: readonly KnowledgeMarkdownSource[] =
  Object.freeze(FUNDING_SCHEMES.flatMap((scheme) =>
    (["en", "zh-HK"] as const).map((locale) => Object.freeze({
      locale,
      url: scheme.sourceUrls[locale],
      markdown: [
        `# ${scheme.name[locale]}`,
        "",
        scheme.summary[locale],
        "",
        FUNDING_VERIFY_CURRENT_TERMS[locale],
        "",
        locale === "en"
          ? `Information current as of ${scheme.asOf}.`
          : `資料截至${scheme.asOf}。`,
      ].join("\n"),
    }))
  ));

export const M4A_ACCEPTANCE_SOURCES: readonly KnowledgeMarkdownSource[] =
  Object.freeze([
    {
      locale: "en",
      url: "https://www.hkwtia.org/membership",
      markdown: [
        "# WTIA Membership",
        "",
        "Approved membership information and member benefits.",
      ].join("\n"),
    },
    {
      locale: "zh-HK",
      url: "https://www.hkwtia.org/zh-HK/membership",
      markdown: [
        "# WTIA 會員",
        "",
        "已批准的會員資料及會員福利。",
      ].join("\n"),
    },
    ...M4A_ACCEPTANCE_FIXTURE.events.flatMap((event) => [
      {
        locale: "en" as const,
        url: `https://www.hkwtia.org/en/events/${event.slug}`,
        markdown: [
          `# ${event.titleEn}`,
          "",
          event.descriptionEn,
          "",
          `${event.startsAt} — ${event.venue}`,
        ].join("\n"),
      },
      {
        locale: "zh-HK" as const,
        url: `https://www.hkwtia.org/zh-HK/events/${event.slug}`,
        markdown: [
          `# ${event.titleZh}`,
          "",
          event.descriptionZh,
          "",
          `${event.startsAt} — ${event.venue}`,
        ].join("\n"),
      },
    ]),
  ]);

export const M4A_DEFAULT_SOURCES: readonly KnowledgeMarkdownSource[] =
  Object.freeze([...M4A_FUNDING_SOURCES, ...M4A_ACCEPTANCE_SOURCES]);

export async function seedM4A(input: Readonly<{
  sources?: readonly KnowledgeMarkdownSource[];
  embedding: EmbeddingAdapter;
  repository: Pick<KbDocumentsRepository, "replaceNamespace">;
}>): Promise<void> {
  const documents = await buildM4ASeedDocuments(
    input.sources ?? M4A_DEFAULT_SOURCES,
    input.embedding,
  );
  await input.repository.replaceNamespace(M4A_KB_NAMESPACE, documents);
}

export async function runM4ASeed(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  // `npm run db:seed:m4a` is directly callable, and unconditionally reconciles
  // a synthetic acceptance member and events (see reconcileM4AAcceptanceFixture
  // below) into whatever DATABASE_URL points at, so the guard has to live here
  // rather than in a wrapper nothing forces callers through.
  //
  // The real funding sources this also writes are available without the guard
  // through `scripts/seed-m4a-knowledge.ts`, which seeds them and nothing else.
  // Keep that entry point free of anything below.
  const databaseUrl = assertIsolatedSeedEnvironment(environment, {
    prefix: "M4A_ACCEPTANCE",
    flag: "M4A_ACCEPTANCE_SEED",
  });
  const apiKey = environment.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY_REQUIRED");
  const knowledge = createKbDocumentsRepositoryForDatabaseUrl(databaseUrl);
  const pool = new Pool({connectionString: databaseUrl, max: 1});
  try {
    await seedM4A({
      // Named rather than left to the default, so the difference between this
      // and the production seed is visible at both call sites instead of one.
      sources: M4A_DEFAULT_SOURCES,
      embedding: createOpenAIEmbeddingAdapter(apiKey),
      repository: knowledge.repository,
    });
    await reconcileM4AAcceptanceFixture(
      createM4AAcceptanceFixtureRepository(pool),
    );
  } finally {
    await Promise.allSettled([knowledge.close(), pool.end()]);
  }
}

const executedPath = process.argv[1]
  ? resolve(process.argv[1])
  : "";
if (executedPath === resolve(fileURLToPath(import.meta.url))) {
  runM4ASeed().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "M4A seed failed.",
    );
    process.exitCode = 1;
  });
}

import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

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

export async function seedM4A(input: Readonly<{
  sources?: readonly KnowledgeMarkdownSource[];
  embedding: EmbeddingAdapter;
  repository: Pick<KbDocumentsRepository, "replaceNamespace">;
}>): Promise<void> {
  const documents = await buildM4ASeedDocuments(
    input.sources ?? M4A_FUNDING_SOURCES,
    input.embedding,
  );
  await input.repository.replaceNamespace(M4A_KB_NAMESPACE, documents);
}

export async function runM4ASeed(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const apiKey = environment.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY_REQUIRED");
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL_REQUIRED");
  const connection = createKbDocumentsRepositoryForDatabaseUrl(databaseUrl);
  try {
    await seedM4A({
      embedding: createOpenAIEmbeddingAdapter(apiKey),
      repository: connection.repository,
    });
  } finally {
    await connection.close();
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

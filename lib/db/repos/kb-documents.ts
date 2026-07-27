import {Pool} from "@neondatabase/serverless";
import {sql, type SQL} from "drizzle-orm";
import {drizzle} from "drizzle-orm/neon-serverless";
import {z} from "zod";

const EMBEDDING_DIMENSIONS = 1536;
const namespaceSchema = z.string().min(1).max(64).regex(
  /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/,
  "KB_NAMESPACE_INVALID",
);
const localeSchema = z.enum(["en", "zh-HK"], {
  errorMap: () => ({message: "KB_LOCALE_INVALID"}),
});
const uuidSchema = z.string().uuid("KB_DOCUMENT_ID_INVALID");

export type KbLocale = z.infer<typeof localeSchema>;

export type KbDocumentInput = Readonly<{
  id: string;
  namespace?: string;
  locale: KbLocale;
  title: string;
  url: string;
  content: string;
  metadata?: Readonly<Record<string, unknown>>;
  embedding: readonly number[];
}>;

export type KbSearchInput = Readonly<{
  namespace: string;
  locale: KbLocale;
  queryEmbedding: readonly number[];
  k: number;
}>;

export type KbSearchResult = Readonly<{
  title: string;
  url: string;
  excerpt: string;
  score: number;
}>;

type KbExecutor = Readonly<{
  execute: (query: SQL) => Promise<unknown>;
}>;
type KbDatabase = KbExecutor & Readonly<{
  transaction: <T>(
    work: (transaction: KbExecutor) => Promise<T>,
  ) => Promise<T>;
}>;
export type KbDatabaseLoader = () => Promise<KbDatabase>;

const searchRowSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  excerpt: z.string(),
  score: z.coerce.number().finite().min(0).max(1),
}).strict();

function resultRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as {rows?: unknown}).rows;
    return Array.isArray(rows) ? rows : [];
  }
  return [];
}

function validNamespace(namespace: string): string {
  const parsed = namespaceSchema.safeParse(namespace);
  if (!parsed.success) throw new Error("KB_NAMESPACE_INVALID");
  return parsed.data;
}

function validLocale(locale: unknown): KbLocale {
  const parsed = localeSchema.safeParse(locale);
  if (!parsed.success) throw new Error("KB_LOCALE_INVALID");
  return parsed.data;
}

function validUrl(value: string): string {
  if (typeof value !== "string" || value !== value.trim()) {
    throw new Error("KB_URL_INVALID");
  }
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.hash ||
      parsed.toString() !== value
    ) {
      throw new Error("KB_URL_INVALID");
    }
    return value;
  } catch {
    throw new Error("KB_URL_INVALID");
  }
}

function validVector(
  vector: readonly number[],
  allowZero = true,
): readonly number[] {
  if (
    !Array.isArray(vector) ||
    vector.length !== EMBEDDING_DIMENSIONS ||
    vector.some((value) => !Number.isFinite(value)) ||
    (!allowZero && vector.every((value) => value === 0))
  ) {
    throw new Error("KB_EMBEDDING_INVALID");
  }
  return vector;
}

function vectorLiteral(vector: readonly number[]): string {
  return `[${vector.join(",")}]`;
}

function validDocument(
  namespace: string,
  input: KbDocumentInput,
): Required<KbDocumentInput> {
  const parsedId = uuidSchema.safeParse(input.id);
  if (!parsedId.success) throw new Error("KB_DOCUMENT_ID_INVALID");
  if (input.namespace !== undefined && input.namespace !== namespace) {
    throw new Error("KB_NAMESPACE_MISMATCH");
  }
  const locale = validLocale(input.locale);
  const title = input.title?.trim();
  if (!title || title.length > 300) throw new Error("KB_TITLE_INVALID");
  const content = input.content?.trim();
  if (!content || content.length > 100_000) {
    throw new Error("KB_CONTENT_INVALID");
  }
  const metadata = input.metadata ?? {};
  let serializedMetadata: string;
  try {
    serializedMetadata = JSON.stringify(metadata);
  } catch {
    throw new Error("KB_METADATA_INVALID");
  }
  if (
    !serializedMetadata ||
    serializedMetadata.length > 20_000 ||
    Array.isArray(metadata) ||
    !metadata ||
    typeof metadata !== "object"
  ) {
    throw new Error("KB_METADATA_INVALID");
  }
  return {
    id: parsedId.data,
    namespace,
    locale,
    title,
    url: validUrl(input.url),
    content,
    metadata,
    embedding: validVector(input.embedding),
  };
}

async function defaultDatabaseLoader(): Promise<KbDatabase> {
  const {getDb} = await import("./common.ts");
  return await getDb() as unknown as KbDatabase;
}

export function createKbDocumentsRepository(
  loadDatabase: KbDatabaseLoader = defaultDatabaseLoader,
) {
  return Object.freeze({
    async replaceNamespace(
      namespaceInput: string,
      inputs: readonly KbDocumentInput[],
    ): Promise<void> {
      const namespace = validNamespace(namespaceInput);
      if (!Array.isArray(inputs)) throw new Error("KB_DOCUMENTS_INVALID");
      const documents = inputs.map((input) =>
        validDocument(namespace, input)
      );
      const ids = new Set<string>();
      for (const document of documents) {
        if (ids.has(document.id)) {
          throw new Error("KB_DOCUMENT_ID_DUPLICATE");
        }
        ids.add(document.id);
      }

      const database = await loadDatabase();
      await database.transaction(async (transaction) => {
        await transaction.execute(sql`
          DELETE FROM "kb_documents"
          WHERE "kb_documents"."namespace" = ${namespace}
        `);
        if (!documents.length) return;
        const values = sql.join(documents.map((document) => sql`(
          ${document.id}::uuid,
          ${namespace},
          ${document.locale},
          ${document.title},
          ${document.url},
          ${document.content},
          ${JSON.stringify(document.metadata)}::jsonb,
          ${vectorLiteral(document.embedding)}::vector
        )`), sql`, `);
        await transaction.execute(sql`
          INSERT INTO "kb_documents"
            ("id", "namespace", "locale", "title", "url", "content",
             "metadata", "embedding")
          VALUES ${values}
        `);
      });
    },

    async search(input: KbSearchInput): Promise<readonly KbSearchResult[]> {
      const namespace = validNamespace(input.namespace);
      const locale = validLocale(input.locale);
      if (!Number.isInteger(input.k) || input.k < 1 || input.k > 10) {
        throw new Error("KB_TOP_K_INVALID");
      }
      const queryEmbedding = validVector(input.queryEmbedding, false);
      const encodedVector = vectorLiteral(queryEmbedding);
      const database = await loadDatabase();
      const result = await database.execute(sql`
        SELECT
          "title",
          "url",
          left("content", 400) AS "excerpt",
          greatest(
            0,
            least(1, 1 - ("embedding" <=> ${encodedVector}::vector))
          )::double precision AS "score"
        FROM "kb_documents"
        WHERE "namespace" = ${namespace}
          AND "locale" = ${locale}
        ORDER BY
          "embedding" <=> ${encodedVector}::vector ASC,
          "url" ASC,
          "title" ASC,
          "id" ASC
        LIMIT ${input.k}
      `);
      return Object.freeze(
        z.array(searchRowSchema).parse(resultRows(result))
          .map((row) => Object.freeze(row)),
      );
    },
  });
}

export type KbDocumentsRepository = ReturnType<
  typeof createKbDocumentsRepository
>;

export const kbDocumentsRepository = createKbDocumentsRepository();

export function createKbDocumentsRepositoryForDatabaseUrl(
  databaseUrl: string,
) {
  const connectionString = databaseUrl.trim();
  if (!connectionString) throw new Error("DATABASE_URL_REQUIRED");
  const pool = new Pool({connectionString});
  const database = drizzle(pool) as unknown as KbDatabase;
  return Object.freeze({
    repository: createKbDocumentsRepository(async () => database),
    close: async () => pool.end(),
  });
}

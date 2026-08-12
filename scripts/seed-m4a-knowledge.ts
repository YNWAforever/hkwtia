import {createOpenAIEmbeddingAdapter} from "../lib/ai/embeddings.ts";
import {createKbDocumentsRepositoryForDatabaseUrl} from "../lib/db/repos/kb-documents.ts";
import {M4A_FUNDING_SOURCES, seedM4A} from "./seed-m4a.ts";

/**
 * The production path for the Concierge knowledge base, and the only seed
 * besides M1 that is deliberately unguarded.
 *
 * `runM4ASeed` writes two unrelated things in one call: the real
 * funding-scheme sources, and a synthetic acceptance member plus two fictional
 * events. Putting the isolation guard on it — correctly — also blocked the
 * only documented way to load real funding content into production, because
 * there was no way to run one half without the other. This is that half.
 *
 * It is unguarded for the same reason `seed-m1.ts` is: everything it writes is
 * real product configuration that production genuinely needs. The safety
 * property is not a flag, it is what this module can reach — it imports
 * `M4A_FUNDING_SOURCES` and nothing else from the fixture side, opens no pool
 * against `profiles` or `events`, and `tests/unit/seed-guard-boundary.test.ts`
 * pins that it never grows a reference to the acceptance fixture.
 *
 * Note that `seedM4A` replaces the whole `m4a-core-v1` namespace rather than
 * merging into it. That is what makes this safe to run against production —
 * the namespace ends up holding exactly the real sources — but it also means
 * running this against an acceptance database removes the acceptance sources
 * that `db:seed:m4a` put there. Re-run `db:seed:m4a` to restore them.
 */
export async function runM4AKnowledgeSeed(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed the M4A knowledge base.");
  }
  const apiKey = environment.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY_REQUIRED");

  const knowledge = createKbDocumentsRepositoryForDatabaseUrl(databaseUrl);
  try {
    await seedM4A({
      sources: M4A_FUNDING_SOURCES,
      embedding: createOpenAIEmbeddingAdapter(apiKey),
      repository: knowledge.repository,
    });
  } finally {
    await knowledge.close();
  }
}

if (process.argv[1]?.endsWith("seed-m4a-knowledge.ts")) {
  runM4AKnowledgeSeed().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "M4A knowledge seed failed.",
    );
    process.exitCode = 1;
  });
}

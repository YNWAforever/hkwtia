import {beforeEach, describe, expect, it, vi} from "vitest";

// vi.mock factories are hoisted above every const in this file, so the doubles
// they close over have to be hoisted too.
const {replaceNamespace, close, createRepository} = vi.hoisted(() => {
  // Typed through the generic rather than the implementation so `mock.calls[0][1]`
  // is the document array — an untyped `vi.fn(async () => …)` records calls as an
  // empty tuple that TypeScript refuses to index.
  const replaceNamespaceFn = vi.fn<
    (namespace: string, documents: readonly {url: string}[]) => Promise<void>
  >(async () => undefined);
  const closeFn = vi.fn(async () => undefined);
  return {
    replaceNamespace: replaceNamespaceFn,
    close: closeFn,
    createRepository: vi.fn(() => ({
      repository: {replaceNamespace: replaceNamespaceFn},
      close: closeFn,
    })),
  };
});

vi.mock("@/lib/db/repos/kb-documents", () => ({
  createKbDocumentsRepositoryForDatabaseUrl: createRepository,
}));
// Only the OpenAI constructor is replaced, and it is replaced with the module's
// own deterministic adapter rather than a hand-rolled stub — the seed validates
// `dimensions` against EMBEDDING_DIMENSIONS, so an invented vector would test
// the validator instead of the seed.
vi.mock("@/lib/ai/embeddings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/embeddings")>();
  return {
    ...actual,
    createOpenAIEmbeddingAdapter: vi.fn(
      () => actual.createDeterministicTestEmbeddingAdapter(),
    ),
  };
});

import {
  M4A_ACCEPTANCE_SOURCES,
  M4A_FUNDING_SOURCES,
  M4A_KB_NAMESPACE,
} from "@/scripts/seed-m4a";
import {runM4AKnowledgeSeed} from "@/scripts/seed-m4a-knowledge";

/**
 * `runM4ASeed` writes real funding content and a synthetic acceptance member in
 * the same call, so guarding it also blocked the only documented way to load
 * the funding content into production. This entry point is that half on its
 * own, and these tests pin the two properties that let it stay unguarded: it
 * runs in production, and it can only write real sources.
 */
const validEnvironment = {
  DATABASE_URL: "postgres://db.test/wtia",
  OPENAI_API_KEY: "sk-test-key",
  NODE_ENV: "test",
} as NodeJS.ProcessEnv;

function seededUrls(): string[] {
  const documents = replaceNamespace.mock.calls[0]?.[1] ?? [];
  return [...new Set(documents.map(({url}) => url))];
}

describe("M4A knowledge seed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses to run without a database url", async () => {
    await expect(runM4AKnowledgeSeed({
      ...validEnvironment, DATABASE_URL: "",
    } as NodeJS.ProcessEnv)).rejects.toThrow("DATABASE_URL is required");
    expect(createRepository).not.toHaveBeenCalled();
  });

  it("refuses to run without an embedding key", async () => {
    await expect(runM4AKnowledgeSeed({
      ...validEnvironment, OPENAI_API_KEY: "",
    } as NodeJS.ProcessEnv)).rejects.toThrow("OPENAI_API_KEY_REQUIRED");
    expect(createRepository).not.toHaveBeenCalled();
  });

  // The whole point of the split. `runM4ASeed` rejects here; this must not,
  // because production is exactly where the funding content has to land.
  it.each([
    ["NODE_ENV", {...validEnvironment, NODE_ENV: "production"}],
    ["VERCEL_ENV", {...validEnvironment, VERCEL_ENV: "production"}],
  ])("runs in production when %s says so, with no isolation flag set", async (_case, environment) => {
    await expect(runM4AKnowledgeSeed(environment as NodeJS.ProcessEnv))
      .resolves.toBeUndefined();
    expect(replaceNamespace).toHaveBeenCalledOnce();
  });

  it("writes the real funding sources and nothing synthetic", async () => {
    await runM4AKnowledgeSeed(validEnvironment);

    const urls = seededUrls();
    const fundingUrls = new Set(M4A_FUNDING_SOURCES.map(({url}) => url));
    const acceptanceUrls = new Set(M4A_ACCEPTANCE_SOURCES.map(({url}) => url));

    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(fundingUrls.has(url), `${url} is not a funding source`).toBe(true);
      expect(acceptanceUrls.has(url), `${url} is an acceptance source`).toBe(false);
    }
    // Every funding source reached the namespace, not just some of them.
    expect(new Set(urls)).toEqual(fundingUrls);
  });

  it("replaces only the scoped namespace", async () => {
    await runM4AKnowledgeSeed(validEnvironment);

    expect(replaceNamespace).toHaveBeenCalledOnce();
    expect(replaceNamespace.mock.calls[0]?.[0]).toBe(M4A_KB_NAMESPACE);
  });

  it("closes the connection even when the write fails", async () => {
    replaceNamespace.mockRejectedValueOnce(new Error("KB_WRITE_FAILED"));

    await expect(runM4AKnowledgeSeed(validEnvironment))
      .rejects.toThrow("KB_WRITE_FAILED");
    expect(close).toHaveBeenCalledOnce();
  });
});

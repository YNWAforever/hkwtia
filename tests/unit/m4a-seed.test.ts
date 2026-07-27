import {readFile} from "node:fs/promises";
import {resolve} from "node:path";

import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";

import {
  FUNDING_AS_OF,
  FUNDING_SCHEMES,
  FUNDING_VERIFY_CURRENT_TERMS,
  evaluateFundingEligibility,
} from "@/config/funding-schemes";
import {
  EMBEDDING_DIMENSIONS,
  MAX_EMBEDDING_TEXT_BYTES,
  createDeterministicTestEmbeddingAdapter,
  createOpenAIEmbeddingAdapter,
} from "@/lib/ai/embeddings";
import {
  createKbDocumentsRepository,
  type KbDocumentInput,
} from "@/lib/db/repos/kb-documents";
import {
  M4A_KB_NAMESPACE,
  buildM4ASeedDocuments,
  parseKnowledgeMarkdown,
  seedM4A,
} from "@/scripts/seed-m4a";

const VECTOR = Array.from({length: 1536}, (_, index) => (index + 1) / 1536);

function normalizedSql(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}

function document(
  overrides: Partial<KbDocumentInput> = {},
): KbDocumentInput {
  return {
    id: "40000001-0000-4000-8000-000000000001",
    locale: "en",
    title: "Membership",
    url: "https://www.hkwtia.org/membership",
    content: "Membership information for technology companies.",
    metadata: {kind: "membership"},
    embedding: VECTOR,
    ...overrides,
  };
}

function proxyDatabase(
  rows: readonly Record<string, unknown>[] = [],
) {
  const statements: Array<{query: string; params: unknown[]}> = [];
  const proxy = drizzle(async (query, params) => {
    statements.push({query, params});
    return {rows: [...rows]};
  });
  let transactions = 0;
  const database = {
    execute: proxy.execute.bind(proxy),
    async transaction<T>(work: (transaction: typeof proxy) => Promise<T>) {
      transactions += 1;
      return work(proxy);
    },
  };
  return {
    database,
    statements,
    transactionCount: () => transactions,
  };
}

describe("M4A embeddings", () => {
  it("produces a stable finite non-zero normalized 1536-value test vector", async () => {
    const adapter = createDeterministicTestEmbeddingAdapter();
    const first = await adapter.embed("香港 technology membership");
    const second = await adapter.embed("香港 technology membership");

    expect(adapter.dimensions).toBe(EMBEDDING_DIMENSIONS);
    expect(first).toEqual(second);
    expect(first).toHaveLength(1536);
    expect(first.every(Number.isFinite)).toBe(true);
    expect(first.some((value) => value !== 0)).toBe(true);
    expect(Math.hypot(...first)).toBeCloseTo(1, 12);
  });

  it("deliberately rejects empty and oversized embedding input", async () => {
    const adapter = createDeterministicTestEmbeddingAdapter();
    await expect(adapter.embed(" \n\t ")).rejects.toThrow(
      "EMBEDDING_TEXT_EMPTY",
    );
    await expect(adapter.embed("a".repeat(MAX_EMBEDDING_TEXT_BYTES + 1)))
      .rejects.toThrow("EMBEDDING_TEXT_TOO_LARGE");
  });

  it("requires an explicit production API key", () => {
    expect(() => createOpenAIEmbeddingAdapter("")).toThrow(
      "OPENAI_API_KEY_REQUIRED",
    );
    expect(() => createOpenAIEmbeddingAdapter("  ")).toThrow(
      "OPENAI_API_KEY_REQUIRED",
    );
  });
});

describe("M4A knowledge repository", () => {
  it("validates all replacement input before opening the database", async () => {
    const loadDatabase = vi.fn();
    const repository = createKbDocumentsRepository(loadDatabase);

    await expect(repository.replaceNamespace("m4a-core-v1", [
      document({embedding: VECTOR.slice(1)}),
    ])).rejects.toThrow("KB_EMBEDDING_INVALID");
    await expect(repository.replaceNamespace("m4a-core-v1", [
      document({embedding: [...VECTOR.slice(0, -1), Number.NaN]}),
    ])).rejects.toThrow("KB_EMBEDDING_INVALID");
    await expect(repository.replaceNamespace("m4a-core-v1", [
      document({namespace: "another-namespace"}),
    ])).rejects.toThrow("KB_NAMESPACE_MISMATCH");
    await expect(repository.replaceNamespace("m4a-core-v1", [
      document(),
      document(),
    ])).rejects.toThrow("KB_DOCUMENT_ID_DUPLICATE");
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("replaces only the exact namespace in one transaction, including empty replacement", async () => {
    const first = proxyDatabase();
    const repository = createKbDocumentsRepository(
      async () => first.database as never,
    );

    await repository.replaceNamespace("m4a-core-v1", [
      document(),
      document({
        id: "40000001-0000-4000-8000-000000000002",
        locale: "zh-HK",
        title: "會員",
        url: "https://www.hkwtia.org/zh-HK/membership",
      }),
    ]);

    expect(first.transactionCount()).toBe(1);
    expect(first.statements).toHaveLength(2);
    expect(normalizedSql(first.statements[0]?.query ?? "")).toMatch(
      /^delete from "kb_documents" where "kb_documents"\."namespace" = \$1$/i,
    );
    expect(first.statements[0]?.params).toEqual(["m4a-core-v1"]);
    expect(normalizedSql(first.statements[1]?.query ?? "")).toMatch(
      /^insert into "kb_documents"/i,
    );
    expect(first.statements[1]?.params).not.toContain("another-namespace");

    const empty = proxyDatabase();
    await createKbDocumentsRepository(async () => empty.database as never)
      .replaceNamespace("other-valid-v1", []);
    expect(empty.transactionCount()).toBe(1);
    expect(empty.statements).toHaveLength(1);
    expect(empty.statements[0]?.params).toEqual(["other-valid-v1"]);
  });

  it("searches one locale and namespace with clamped cosine score and stable tie-breaks", async () => {
    const fixture = proxyDatabase([
      {
        title: "Membership",
        url: "https://www.hkwtia.org/membership",
        excerpt: "Member information",
        score: 0.75,
      },
    ]);
    const repository = createKbDocumentsRepository(
      async () => fixture.database as never,
    );

    await expect(repository.search({
      namespace: "m4a-core-v1",
      locale: "zh",
      queryEmbedding: VECTOR,
      k: 2,
    } as never)).rejects.toThrow("KB_LOCALE_INVALID");
    await expect(repository.search({
      namespace: "m4a-core-v1",
      locale: "en",
      queryEmbedding: VECTOR,
      k: 0,
    })).rejects.toThrow("KB_TOP_K_INVALID");
    await expect(repository.search({
      namespace: "m4a-core-v1",
      locale: "en",
      queryEmbedding: VECTOR,
      k: 11,
    })).rejects.toThrow("KB_TOP_K_INVALID");
    expect(fixture.statements).toEqual([]);

    const results = await repository.search({
      namespace: "m4a-core-v1",
      locale: "en",
      queryEmbedding: VECTOR,
      k: 10,
    });

    expect(results).toEqual([{
      title: "Membership",
      url: "https://www.hkwtia.org/membership",
      excerpt: "Member information",
      score: 0.75,
    }]);
    expect(Object.keys(results[0] ?? {}).sort()).toEqual(
      ["excerpt", "score", "title", "url"],
    );
    expect(fixture.statements).toHaveLength(1);
    const statement = fixture.statements[0]!;
    const query = normalizedSql(statement.query).toLowerCase();
    expect(query).toContain("greatest");
    expect(query).toContain("least");
    expect(query).toContain("<=>");
    expect(query).toMatch(
      /where .*namespace.*locale/,
    );
    expect(query).toMatch(
      /order by .*<=>.*url.*title.*id/,
    );
    expect(statement.params).toEqual(expect.arrayContaining([
      "m4a-core-v1",
      "en",
      10,
    ]));
  });
});

describe("deterministic funding catalogue", () => {
  it("contains only the five current schemes and immutable bilingual citations", () => {
    expect(FUNDING_AS_OF).toBe("2026-07-27");
    expect(FUNDING_SCHEMES.map(({id}) => id)).toEqual([
      "bud",
      "nittp",
      "nifs",
      "nias",
      "rd-cash-rebate",
    ]);
    expect(JSON.stringify(FUNDING_SCHEMES)).not.toMatch(
      /technology voucher|(^|[^a-z])tvp([^a-z]|$)|export marketing fund|"emf"/i,
    );
    for (const scheme of FUNDING_SCHEMES) {
      expect(scheme.active).toBe(true);
      expect(scheme.asOf).toBe(FUNDING_AS_OF);
      expect(scheme.name.en).not.toBe("");
      expect(scheme.name["zh-HK"]).not.toBe("");
      expect(scheme.summary.en).not.toBe("");
      expect(scheme.summary["zh-HK"]).not.toBe("");
      expect(scheme.sourceUrls.en).toMatch(/^https:\/\//);
      expect(scheme.sourceUrls["zh-HK"]).toMatch(/^https:\/\//);
      expect(Object.isFrozen(scheme)).toBe(true);
    }
    expect(FUNDING_VERIFY_CURRENT_TERMS.en).toMatch(/not approval/i);
    expect(FUNDING_VERIFY_CURRENT_TERMS["zh-HK"]).toMatch(/不代表.*批/i);
  });

  it("returns deterministic bilingual eligibility without implying approval", () => {
    const input = {
      hongKongIncorporated: true,
      hongKongBusinessRegistered: true,
      operatesInHongKong: true,
      nonSubvented: true,
      expansionProjectInCoveredEconomy: true,
      advancedTechnologyTraining: true,
      traineeHongKongPermanentResident: true,
      smartProductionLineInHongKong: true,
      targetSector: "ai-data-science",
      enterpriseInvestmentHkd: 100_000_000,
      totalProjectCostHkd: 150_000_000,
      eligibleAppliedRdOrPartnershipExpenditureHkd: 1_000_000,
    } as const;

    const first = evaluateFundingEligibility(input, "en");
    const second = evaluateFundingEligibility({...input}, "zh-HK");

    expect(first.map(({id, potentiallyEligible}) => ({
      id,
      potentiallyEligible,
    }))).toEqual(second.map(({id, potentiallyEligible}) => ({
      id,
      potentiallyEligible,
    })));
    expect(first.every(({potentiallyEligible}) => potentiallyEligible))
      .toBe(true);
    expect(first.every(({disclaimer}) => /not approval/i.test(disclaimer)))
      .toBe(true);
    expect(second.every(({disclaimer}) => /不代表.*批/i.test(disclaimer)))
      .toBe(true);
  });
});

describe("M4A seed", () => {
  it("parses bilingual markdown into stable canonical source chunks", async () => {
    const [english, chinese] = await Promise.all([
      readFile(resolve(
        process.cwd(),
        "tests/fixtures/kb/membership-en.md",
      ), "utf8"),
      readFile(resolve(
        process.cwd(),
        "tests/fixtures/kb/membership-zh-hk.md",
      ), "utf8"),
    ]);
    const inputs = [
      {
        locale: "en" as const,
        url: "https://www.hkwtia.org/membership",
        markdown: english,
      },
      {
        locale: "zh-HK" as const,
        url: "https://www.hkwtia.org/zh-HK/membership",
        markdown: chinese,
      },
    ];

    const first = inputs.flatMap(parseKnowledgeMarkdown);
    const second = inputs.flatMap(parseKnowledgeMarkdown);
    expect(first).toEqual(second);
    expect(first.map(({locale}) => locale)).toEqual([
      "en",
      "en",
      "zh-HK",
      "zh-HK",
    ]);
    expect(new Set(first.map(({id}) => id)).size).toBe(first.length);
    expect(first.every(({url}) => url.startsWith("https://"))).toBe(true);

    const adapter = createDeterministicTestEmbeddingAdapter();
    const documents = await buildM4ASeedDocuments(inputs, adapter);
    expect(documents.map(({id}) => id)).toEqual(
      [...documents].map(({id}) => id).sort(),
    );
    expect(documents.every(({embedding}) =>
      embedding.length === EMBEDDING_DIMENSIONS
    )).toBe(true);
  });

  it("uses the fixed namespace and injected dependencies without a live key or database", async () => {
    const replaceNamespace = vi.fn(async (
      _namespace: string,
      _documents: readonly KbDocumentInput[],
    ) => {
      void _namespace;
      void _documents;
    });
    const adapter = createDeterministicTestEmbeddingAdapter();
    const sources = [{
      locale: "en" as const,
      url: "https://www.hkwtia.org/membership",
      markdown: "# Membership\n\nCurrent member information.",
    }];

    await seedM4A({
      sources,
      embedding: adapter,
      repository: {replaceNamespace},
    });

    expect(M4A_KB_NAMESPACE).toBe("m4a-core-v1");
    expect(replaceNamespace).toHaveBeenCalledOnce();
    expect(replaceNamespace.mock.calls[0]?.[0]).toBe(M4A_KB_NAMESPACE);
    expect(replaceNamespace.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          locale: "en",
          embedding: expect.any(Array),
        }),
      ]),
    );
  });
});

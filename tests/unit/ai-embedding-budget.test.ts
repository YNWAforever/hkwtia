// @vitest-environment node
import {afterEach, expect, it, vi} from "vitest";
import {createOpenAIEmbeddingAdapter} from "@/lib/ai/embeddings";
import {syntheticAiBudget} from "../helpers/ai-budget";
afterEach(() => vi.unstubAllGlobals());
it("embedding calls reserve their own budget before actual SDK HTTP and settle reported usage", async () => {
  const budget = syntheticAiBudget();
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          data: [{embedding: Array(1536).fill(0.1), index: 0}],
          usage: {prompt_tokens: 10, total_tokens: 10},
        }),
        {
          headers: {
            "content-type": "application/json",
            "x-request-id": "req_synthetic_embedding",
          },
        },
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const adapter = createOpenAIEmbeddingAdapter("synthetic-key", {budget});
  expect(await adapter.embed("Synthetic knowledge only")).toHaveLength(1536);
  expect(budget.reserveAiBudget).toHaveBeenCalledWith(
    expect.objectContaining({scope: "embedding", maxCostMicrousd: 164}),
  );
  expect(budget.markDispatched).toHaveBeenCalledOnce();
  expect(budget.settleAiBudget).toHaveBeenCalledWith(
    expect.objectContaining({usageState: "known", actualMicrousd: 0}),
  );
  expect(fetch).toHaveBeenCalledOnce();
});

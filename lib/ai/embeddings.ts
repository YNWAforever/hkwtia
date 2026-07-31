import {createHash} from "node:crypto";

import {createOpenAI} from "@ai-sdk/openai";
import {embed as embedValue} from "ai";

export const EMBEDDING_DIMENSIONS = 1536 as const;
export const MAX_EMBEDDING_TEXT_BYTES = 32_000;

export type EmbeddingAdapter = Readonly<{
  dimensions: typeof EMBEDDING_DIMENSIONS;
  embed: (text: string) => Promise<readonly number[]>;
}>;

function validatedText(text: string): string {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("EMBEDDING_TEXT_EMPTY");
  }
  if (new TextEncoder().encode(text).byteLength > MAX_EMBEDDING_TEXT_BYTES) {
    throw new Error("EMBEDDING_TEXT_TOO_LARGE");
  }
  return text;
}

function validatedVector(vector: readonly number[]): readonly number[] {
  if (
    vector.length !== EMBEDDING_DIMENSIONS ||
    vector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error("EMBEDDING_VECTOR_INVALID");
  }
  return Object.freeze([...vector]);
}

/**
 * Test-only by construction: attempting to instantiate this adapter outside a
 * test process fails instead of silently replacing the production provider.
 */
export function createDeterministicTestEmbeddingAdapter(): EmbeddingAdapter {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("DETERMINISTIC_EMBEDDINGS_TEST_ONLY");
  }
  return Object.freeze({
    dimensions: EMBEDDING_DIMENSIONS,
    async embed(text: string) {
      const input = validatedText(text);
      const vector: number[] = [];
      for (
        let counter = 0;
        vector.length < EMBEDDING_DIMENSIONS;
        counter += 1
      ) {
        const counterBytes = Buffer.allocUnsafe(4);
        counterBytes.writeUInt32BE(counter);
        const digest = createHash("sha256")
          .update("hkwtia:m4a:test-embedding:v1\0", "utf8")
          .update(input, "utf8")
          .update(counterBytes)
          .digest();
        for (let offset = 0; offset < digest.length; offset += 4) {
          vector.push(
            digest.readInt32BE(offset) / 0x8000_0000,
          );
        }
      }
      const magnitude = Math.hypot(...vector);
      return validatedVector(vector.map((value) => value / magnitude));
    },
  });
}

export function createOpenAIEmbeddingAdapter(apiKey: string): EmbeddingAdapter {
  const explicitApiKey = apiKey.trim();
  if (!explicitApiKey) throw new Error("OPENAI_API_KEY_REQUIRED");
  const provider = createOpenAI({apiKey: explicitApiKey});
  const model = provider.embedding("text-embedding-3-small");
  return Object.freeze({
    dimensions: EMBEDDING_DIMENSIONS,
    async embed(text: string) {
      const result = await embedValue({
        model,
        value: validatedText(text),
      });
      return validatedVector(result.embedding);
    },
  });
}

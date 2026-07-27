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

function fnv1a(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
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
      const bytes = new TextEncoder().encode(validatedText(text));
      let state = fnv1a(bytes) || 0x6d2b79f5;
      const vector = new Array<number>(EMBEDDING_DIMENSIONS);
      let squaredMagnitude = 0;
      for (let index = 0; index < EMBEDDING_DIMENSIONS; index += 1) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        const value = ((state >>> 0) / 0x1_0000_0000) * 2 - 1;
        vector[index] = value;
        squaredMagnitude += value * value;
      }
      const magnitude = Math.sqrt(squaredMagnitude);
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

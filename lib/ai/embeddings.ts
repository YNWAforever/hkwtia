import {receiptAwareFetch} from "@/lib/ai/providers/request-receipt";
import {defaultAiBudgetPort,type AiBudgetPort} from "@/lib/ai/budget";
import {AI_EMBEDDING_PRICING} from "@/config/ai-pricing";
import {calculateAgentCostMicrousd} from "@/lib/ai/pricing";
import {createHash,randomUUID} from "node:crypto";

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

export function createOpenAIEmbeddingAdapter(apiKey: string,options:Readonly<{budget?:AiBudgetPort}>={}): EmbeddingAdapter {
  const explicitApiKey = apiKey.trim();
  if (!explicitApiKey) throw new Error("OPENAI_API_KEY_REQUIRED");
  return Object.freeze({
    dimensions: EMBEDDING_DIMENSIONS,
    async embed(text: string) {
      const value=validatedText(text),bytes=Buffer.byteLength(value,"utf8");
      // A conservative byte ceiling below the model's 8192-token context, not a tokenizer claim.
      if(bytes>8191)throw Error("EMBEDDING_INPUT_BOUND_EXCEEDED");
      const budget=options.budget??defaultAiBudgetPort;
      const admitted=await budget.reserveAiBudget({runKey:randomUUID(),scope:"embedding",maxCostMicrousd:calculateAgentCostMicrousd({inputTokens:8192,outputTokens:0},AI_EMBEDDING_PRICING,true),expiresAt:new Date(Date.now()+20_000).toISOString()});
      if(!admitted.ok)throw Error(`AI_EMBEDDING_${admitted.reason}`);
      let dispatched=false,known=false;
      const controller=new AbortController();let abort!:()=>void;
      const deadline=new Promise<never>((_resolve,reject)=>{abort=()=>{controller.abort();reject(Error("AI_EMBEDDING_TIMEOUT"));};});
      void deadline.catch(()=>{});const timer=setTimeout(abort,20_000);
      try {
        await budget.markDispatched(admitted.reservationId);dispatched=true;
        const provider=createOpenAI({apiKey:explicitApiKey,fetch:receiptAwareFetch(requestId=>budget.recordProviderReceipt?.(admitted.reservationId,requestId))});
        const model=provider.embedding("text-embedding-3-small");
        const pending=embedValue({model,value,maxRetries:0,abortSignal:controller.signal,onEnd:async result=>{
          const tokens=result.usage.tokens;
          await budget.settleAiBudget({reservationId:admitted.reservationId,usageState:"known",actualMicrousd:calculateAgentCostMicrousd({inputTokens:tokens,outputTokens:0},AI_EMBEDDING_PRICING)});known=true;
        }});
        const result=await Promise.race([pending,deadline]);return validatedVector(result.embedding);
      } catch {
        if(!known){if(dispatched)await budget.settleAiBudget({reservationId:admitted.reservationId,usageState:"unknown",actualMicrousd:null});else await budget.releaseUndispatched(admitted.reservationId);}
        // Provider messages may include source text; never expose or log them.
        throw Error("AI_EMBEDDING_FAILED");
      } finally {clearTimeout(timer);}
    },
  });
}

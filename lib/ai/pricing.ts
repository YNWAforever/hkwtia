import type {AgentModelPrice} from '@/config/ai-pricing';
import type {AgentUsage} from '@/lib/ai/provider';

export function validateAgentUsage(usage: AgentUsage): AgentUsage {
 const fields=[usage.inputTokens,usage.outputTokens,usage.cacheReadTokens??0,usage.cacheWriteTokens??0,usage.reasoningTokens??0];
 if(fields.some(v=>!Number.isSafeInteger(v)||v<0)
  || BigInt(fields[2]!)+BigInt(fields[3]!)>BigInt(usage.inputTokens)
  || (usage.reasoningTokens??0)>usage.outputTokens)throw new Error('AGENT_USAGE_INVALID');
 return usage;
}
function rate(value:number):bigint {
 if(!Number.isFinite(value)||value<0||!Number.isSafeInteger(value*1_000_000))throw new Error('AGENT_PRICE_INVALID');
 return BigInt(value*1_000_000);
}
/** Exact fixed-point micro-USD; reasoning is a subset of aggregate output. */
export function calculateAgentCostMicrousd(usage:AgentUsage,pricing:AgentModelPrice,roundUp=false):number {
 validateAgentUsage(usage);
 const read=usage.cacheReadTokens??0,write=usage.cacheWriteTokens??0;
 // Missing cache price uses the full base rate conservatively; no implicit free tokens.
 const total=BigInt(usage.inputTokens-read-write)*rate(pricing.inputUsdPerMillion)
  +BigInt(read)*rate(pricing.cacheReadUsdPerMillion??pricing.inputUsdPerMillion)
  +BigInt(write)*rate(pricing.cacheWriteUsdPerMillion??pricing.inputUsdPerMillion)
  +BigInt(usage.outputTokens)*rate(pricing.outputUsdPerMillion);
 const amount=(total+(roundUp?999_999n:500_000n))/1_000_000n;
 if(amount>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('AGENT_COST_INVALID');
 return Number(amount);
}
export function microusdToUsd(amount:number):string {
 if(!Number.isSafeInteger(amount)||amount<0)throw new Error('AGENT_COST_INVALID');
 const value=BigInt(amount);return `${value/1_000_000n}.${(value%1_000_000n).toString().padStart(6,'0')}`;
}
export function calculateAgentCostUsd(usage:AgentUsage,pricing:AgentModelPrice):string {
 return microusdToUsd(calculateAgentCostMicrousd(usage,pricing));
}

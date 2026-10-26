/** Nearest-rank percentiles, without mutating acquisition order. */
export function timingSummary(samples: readonly number[]) {
  if (!samples.length || samples.some(n=>!Number.isFinite(n)||n<0)) throw Error('INVALID_TIMING_SAMPLES');
  const sorted=[...samples].sort((a,b)=>a-b);
  return {samples:sorted.length,p50Ms:sorted[Math.ceil(sorted.length*0.5)-1],p95Ms:sorted[Math.ceil(sorted.length*0.95)-1],maxMs:sorted.at(-1)!};
}

import {describe, expect, it} from 'vitest';
import {timingSummary} from '@/scripts/acceptance/db-timing';

describe('DB timing nearest-rank summary',()=>{
  it('uses nearest rank p50/p95, preserves samples and reports max',()=>{
    const samples=Array.from({length:30},(_,i)=>30-i);
    expect(timingSummary(samples)).toEqual({samples:30,p50Ms:15,p95Ms:29,maxMs:30});
    expect(samples[0]).toBe(30);
  });
  it('rejects empty, negative and nonfinite observations',()=>{
    for(const values of [[],[-1],[NaN],[Infinity]]) expect(()=>timingSummary(values)).toThrow();
  });
});

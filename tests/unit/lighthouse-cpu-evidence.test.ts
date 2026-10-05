// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {summarizeLighthouseTrace} from '@/scripts/summarize-lighthouse-cpu.mjs';

const frame = (id: number, functionName = 'hydrate', url = 'https://hkwtia.vercel.app/_next/static/chunks/app.js?dpl=public-id') => ({id, callFrame: {functionName, url, lineNumber: 0, columnNumber: 40}});
const trace = (nodes = [frame(1)]) => ({traceEvents: [
  {name: 'ProfileChunk', pid: 10, tid: 20, id: '0x1', args: {data: {cpuProfile: {nodes, samples: [1]}, timeDeltas: [1000]}}},
  {name: 'ProfileChunk', pid: 10, tid: 20, id: '0x1', args: {data: {cpuProfile: {samples: [1]}, timeDeltas: [2000]}}},
]});

describe('public Lighthouse CPU evidence', () => {
  it('joins profile chunks and reports hand-derived sampled self time', () => {
    const result = summarizeLighthouseTrace(trace());
    expect(result.sampledProfiles).toBe(1);
    expect(result.sampleCount).toBe(2);
    expect(result.cpuSelf).toEqual([{functionName: 'hydrate', path: '/_next/static/chunks/app.js', line: 1, column: 41, selfMs: 3}]);
  });
  it('keeps equal node IDs in different renderer profiles separate', () => {
    const first = trace();
    first.traceEvents.push({name: 'ProfileChunk', pid: 11, tid: 21, id: '0x1', args: {data: {cpuProfile: {nodes: [frame(1, 'parse')], samples: [1]}, timeDeltas: [4000]}}});
    const result = summarizeLighthouseTrace(first);
    expect(result.sampledProfiles).toBe(2);
    expect(result.cpuSelf.map(x => [x.functionName, x.selfMs])).toEqual([['parse', 4], ['hydrate', 3]]);
  });
  it('joins sampling chunks recorded on different threads for the same CPU profile', () => {
    const input = trace(); input.traceEvents[1].tid = 99;
    expect(summarizeLighthouseTrace(input).sampledProfiles).toBe(1);
    expect(summarizeLighthouseTrace(input).cpuSelf[0].selfMs).toBe(3);
  });
  it('uses the upstream one-microsecond floor for real Chrome clock jitter and records the adjustment', () => {
    const input = trace(); input.traceEvents[0].args.data.timeDeltas = [-6];
    const result = summarizeLighthouseTrace(input);
    expect(result.clockAdjustedSamples).toBe(1);
    expect(result.cpuSelf[0].selfMs).toBe(2.001);
  });
  it('exports timing and safe coordinates without request headers, query strings or credentials', () => {
    const secret = 'sk_test_synthetic_canary_1234567890';
    const input = {traceEvents: [
      ...trace([frame(1, secret, 'https://user:password@hkwtia.vercel.app/_next/a.js?token=synthetic-token')]).traceEvents,
      {name: 'EvaluateScript', dur: 80000, args: {data: {url: 'https://hkwtia.vercel.app/_next/static/chunks/b.js?code=secret-code', headers: {Cookie: 'synthetic-cookie'}, token: 'private-token'}}},
      {name: 'ResourceSendRequest', args: {data: {headers: {Authorization: 'private-bearer'}, url: 'https://external.example/synthetic-email@example.test'}}},
    ]};
    const result = summarizeLighthouseTrace(input);
    expect(result.longTasks).toEqual([{name: 'EvaluateScript', durationMs: 80, path: '/_next/static/chunks/b.js'}]);
    const exported = JSON.stringify(result);
    for (const value of [secret, 'password', 'synthetic-token', 'secret-code', 'synthetic-cookie', 'private-token', 'private-bearer', 'synthetic-email']) expect(exported).not.toContain(value);
    expect(result.cpuSelf[0].path).toBe(null);
  });
  it('does not invent CPU samples from a normal unsampled trace', () => {
    const result = summarizeLighthouseTrace({traceEvents: [{name: 'Layout', dur: 60000}]});
    expect(result.sampledProfiles).toBe(0);
    expect(result.sampleCount).toBe(0);
    expect(result.cpuSelf).toEqual([]);
    expect(result.longTasks).toEqual([{name: 'Layout', durationMs: 60, path: null}]);
  });
  it('rejects partial traces and mismatched sample clocks instead of exporting reassuring zeros', () => {
    expect(() => summarizeLighthouseTrace({})).toThrow('LIGHTHOUSE_TRACE_INVALID');
    const input = trace(); input.traceEvents[0].args.data.timeDeltas = [];
    expect(() => summarizeLighthouseTrace(input)).toThrow('LIGHTHOUSE_PROFILE_CLOCK_INVALID');
  });
});

import {readFileSync, readdirSync, mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const PUBLIC_ORIGINS = new Set(['https://hkwtia.vercel.app', 'https://hkwtia.org']);
function publicScriptPath(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (!PUBLIC_ORIGINS.has(url.origin) || url.username || url.password) return null;
    // Only public compiled script/stylesheet paths; never arbitrary URLs or their queries.
    return /^\/_next\/static\/[A-Za-z0-9/_.()%\[\]-]+$/.test(url.pathname) ? url.pathname : null;
  } catch { return null; }
}
function cpuSourceKind(value) {
  if (typeof value !== 'string' || value === '') return 'native-or-unknown';
  try {
    const url = new URL(value);
    if (url.protocol === 'blob:') return 'blob';
    if (url.protocol === 'wasm:') return 'wasm';
    if (url.protocol === 'data:') return 'data';
    if (url.protocol === 'chrome-extension:') return 'extension';
    if (PUBLIC_ORIGINS.has(url.origin) && !url.username && !url.password) {
      return publicScriptPath(value) ? 'app-static' : 'app-inline-or-eval';
    }
    if (['pptr:', 'lighthouse:', 'chrome:', 'devtools:'].includes(url.protocol)) return 'auditor-or-browser-internal';
    return 'external-or-redacted';
  } catch { return 'eval-or-injected'; }
}
function safeFunctionName(value) {
  return typeof value === 'string' && /^[$\w()[\].<> -]{0,120}$/.test(value) && !/sk_(?:test|live)_|sk-proj-|secret|token|password|cookie/i.test(value)
    ? value || '(anonymous)' : '(redacted)';
}

/** CPU coordinates/timing only. Request events, source bodies and headers are never copied. */
export function summarizeLighthouseTrace(trace) {
  if (!trace || !Array.isArray(trace.traceEvents)) throw new Error('LIGHTHOUSE_TRACE_INVALID');
  const profiles = new Map(), longTasks = [];
  let clockAdjustedSamples = 0;
  for (const event of trace.traceEvents) {
    if (['EvaluateScript', 'FunctionCall', 'Layout', 'UpdateLayoutTree', 'ParseHTML'].includes(event.name) && Number.isFinite(event.dur) && event.dur >= 50000) {
      longTasks.push({name: event.name, durationMs: event.dur / 1000, path: publicScriptPath(event.args?.data?.url ?? event.args?.data?.scriptName)});
    }
    if (event.name !== 'ProfileChunk' && event.name !== 'Profile') continue;
    const key = JSON.stringify([event.pid, event.id ?? event.id2?.local ?? event.id2?.global]);
    let profile = profiles.get(key);
    if (!profile) { profile = {nodes: new Map(), times: new Map(), sampleCount: 0}; profiles.set(key, profile); }
    const data = event.args?.data, cpu = data?.cpuProfile;
    for (const node of cpu?.nodes ?? []) profile.nodes.set(node.id, node.callFrame);
    const samples = cpu?.samples ?? [], deltas = data?.timeDeltas ?? cpu?.timeDeltas ?? [];
    if (samples.length !== deltas.length || deltas.some(x => !Number.isFinite(x))) throw new Error('LIGHTHOUSE_PROFILE_CLOCK_INVALID');
    // Chrome sampling can have small negative clock jitter. Match Lighthouse
    // CPUProfileModel's one-microsecond floor and report every adjustment.
    for (let i = 0; i < samples.length; i++) {
      if (deltas[i] < 1) clockAdjustedSamples++;
      profile.times.set(samples[i], (profile.times.get(samples[i]) ?? 0) + Math.max(deltas[i], 1));
    }
    profile.sampleCount += samples.length;
  }
  const frames = new Map();
  let sampleCount = 0;
  for (const profile of profiles.values()) {
    sampleCount += profile.sampleCount;
    for (const [id, us] of profile.times) {
      const frame = profile.nodes.get(id);
      if (!frame) throw new Error('LIGHTHOUSE_PROFILE_NODE_MISSING');
      const row = {functionName: safeFunctionName(frame.functionName), path: publicScriptPath(frame.url), sourceKind: cpuSourceKind(frame.url), line: Number.isInteger(frame.lineNumber) && frame.lineNumber >= 0 ? frame.lineNumber + 1 : null, column: Number.isInteger(frame.columnNumber) && frame.columnNumber >= 0 ? frame.columnNumber + 1 : null};
      const key = JSON.stringify(row), previous = frames.get(key);
      if (previous) previous.selfMs += us / 1000;
      else frames.set(key, {...row, selfMs: us / 1000});
    }
  }
  return {sampledProfiles: profiles.size, sampleCount, clockAdjustedSamples, cpuSelf: [...frames.values()].sort((a, b) => b.selfMs - a.selfMs).slice(0, 100), longTasks: longTasks.sort((a, b) => b.durationMs - a.durationMs).slice(0, 100)};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const files = readdirSync('.').filter(name => name.endsWith('.trace.json')).sort();
    if (!files.length) throw new Error('LIGHTHOUSE_TRACE_FILES_MISSING');
    const traces = files.map(file => ({file, ...summarizeLighthouseTrace(JSON.parse(readFileSync(file, 'utf8')))}));
    mkdirSync('.lighthouseci', {recursive: true});
    writeFileSync('.lighthouseci/cpu-profile-summary.json', JSON.stringify({observedAt: new Date().toISOString(), diagnosticOnly: true, samplingCanAffectTimings: true, normalGateUnchanged: true, rawTracesAndDevtoolsLogsExported: false, traces}, null, 2) + '\n');
    if (traces.some(x => x.sampleCount === 0)) throw new Error('LIGHTHOUSE_CPU_SAMPLES_MISSING');
    console.log(JSON.stringify({traceFiles: traces.length, sampledProfiles: traces.reduce((n, x) => n + x.sampledProfiles, 0), rawTracesAndDevtoolsLogsExported: false, diagnosticOnly: true}));
  } catch (error) {
    console.error(error instanceof Error && /^LIGHTHOUSE_[A-Z_]+$/.test(error.message) ? error.message : 'LIGHTHOUSE_CPU_EVIDENCE_FAILED');
    process.exitCode = 1;
  }
}

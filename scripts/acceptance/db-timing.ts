/** Nearest-rank percentiles, without mutating acquisition order. */
export function timingSummary(samples: readonly number[]) {
  if (!samples.length || samples.some(n=>!Number.isFinite(n)||n<0)) throw Error('INVALID_TIMING_SAMPLES');
  const sorted=[...samples].sort((a,b)=>a-b);
  return {samples:sorted.length,p50Ms:sorted[Math.ceil(sorted.length*0.5)-1],p95Ms:sorted[Math.ceil(sorted.length*0.95)-1],maxMs:sorted.at(-1)!};
}

export type RetryStats = {attempts:number;failedHandshakes:number;retriedSuccesses:number;exhausted:number};
export const retryStats = (): RetryStats => ({attempts:0,failedHandshakes:0,retriedSuccesses:0,exhausted:0});
/** Only use around connection acquisition, never around SQL or assertions. */
export function isTransientConnectError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const {code,message,name}=error as {code?:unknown;message?:unknown;name?:unknown};
  if (name==='AssertionError' || (typeof code==='string' && /^[0-9A-Z]{5}$/.test(code))) return false;
  return ['ECONNRESET','ETIMEDOUT','ECONNREFUSED'].includes(String(code))
    || (typeof message==='string' && /received network error or non-101 status code|connection (?:timeout|timed out)|timeout exceeded when trying to connect/i.test(message));
}
export async function retryConnect<T>(connect:()=>Promise<T>, stats=retryStats(), sleep:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))):Promise<T> {
  for(let attempt=1;attempt<=3;attempt++) {
    stats.attempts++;
    try {
      const result=await connect();
      if(attempt>1) stats.retriedSuccesses++;
      return result;
    } catch(error) {
      if(!isTransientConnectError(error)) throw error;
      stats.failedHandshakes++;
      if(attempt===3) {stats.exhausted++;throw error;}
      await sleep(100*attempt);
    }
  }
  throw Error('UNREACHABLE');
}

/** Fresh pool per failed handshake; caller must end the successful pool. */
export async function connectTimingPool<P extends {connect():Promise<{release():void}>;end():Promise<void>}>(factory:()=>P,stats=retryStats()) {
  return retryConnect(async()=>{
    const pool=factory();
    const start=performance.now();
    try {
      const client=await pool.connect();
      const connected=performance.now();
      client.release();
      return {pool,start,connected};
    } catch(error) {await pool.end();throw error;}
  },stats);
}

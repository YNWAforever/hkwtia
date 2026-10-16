// A deterministic backing store for the REAL Next unstable_cache implementation.
// Only transport/storage and revalidateTag's request context are substituted.
export function nextDataCacheStore() {
  const entries = new Map<string,{value:unknown;tags:readonly string[];until:number}>();
  return {
    entries,
    expire(tag:string){for(const [key,value] of entries) if(value.tags.includes(tag)) entries.delete(key);},
    generateSimpleCacheKey: async (key:string)=>key,
    async get(key:string){const hit=entries.get(key);return hit && hit.until>Date.now()?{value:hit.value,isStale:false}:null;},
    async set(key:string,value:unknown,options:{tags?:string[]}){entries.set(key,{value,tags:options.tags??[],until:Date.now()+60_000});},
  };
}

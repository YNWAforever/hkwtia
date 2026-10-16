import {appendFileSync} from "node:fs";
const original=globalThis.fetch;
const pacingMs=Number(process.env.T22_AUTH_PROVIDER_MIN_INTERVAL_MS??"0");
if(!Number.isFinite(pacingMs) || pacingMs<0 || pacingMs>5000)throw Error("INVALID_TEST_AUTH_PACING");
let nextPermitAt=0;
globalThis.fetch=async function(...args){
 const input=args[0],init=args[1];let url;
 try{url=new URL(typeof input==="string"||input instanceof URL?String(input):input.url);}catch{return original(...args);}
 const isolatedAuthHost=url.hostname==="ep-plain-mouse-azm8pl2j.neonauth.c-3.ap-southeast-1.aws.neon.tech";
 if(isolatedAuthHost && pacingMs>0){
  const permitAt=Math.max(Date.now(),nextPermitAt);nextPermitAt=permitAt+pacingMs;
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,permitAt-Date.now())));
 }
 const monitored=url.hostname==="ep-plain-mouse-azm8pl2j.neonauth.c-3.ap-southeast-1.aws.neon.tech"&&url.pathname.endsWith("/get-session");
 if(!monitored)return original(...args);
 const headers=new Headers(init?.headers??(input instanceof Request?input.headers:undefined));
 const cookieCredentialed=(headers.get("cookie")??"").split(";").some(x=>x.trim().startsWith("__Secure-neon-auth"));
 const response=await original(...args);
 appendFileSync(".playwright/t22-auth-upstream-safe.jsonl",JSON.stringify({observedAt:new Date().toISOString(),path:"/get-session",cookieCredentialed,status:response.status,disableCookieCache:url.searchParams.get("disableCookieCache")==="true",disableRefresh:url.searchParams.get("disableRefresh")==="true",payloadLogged:false,pacingMs,retryAfterSeconds:/^\d+$/.test(response.headers.get("retry-after")??"")?Number(response.headers.get("retry-after")):null})+"\n");return response;
};

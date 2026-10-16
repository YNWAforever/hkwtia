import {chromium} from "playwright";
import {spawn} from "node:child_process";
import {writeFileSync,readFileSync,readdirSync,existsSync} from "node:fs";
import {setTimeout as delay} from "node:timers/promises";
import {createServer} from "node:net";
import assert from "node:assert/strict";
assert.equal(new URL(process.env.DATABASE_URL_TEST).hostname,"ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech");
assert.equal(process.env.DATABASE_URL,process.env.DATABASE_URL_TEST);
const env={...process.env,CHROME_PATH:chromium.executablePath(),NODE_OPTIONS:"--max-old-space-size=4096",LHCI_BASE_URL:"http://localhost:3450",LHCI_COOKIE_FILE:"",PLAYWRIGHT_STORAGE_STATE:"",VERCEL_SHARE_TOKEN:"",VERCEL_ENV:"preview",NEXT_PUBLIC_SITE_URL:"http://localhost:3450",APP_URL:"http://localhost:3450",EMAIL_DELIVERY_MODE:"test",RUN_LIVE_WOZTELL:"0",AUDIT_BATCH_WORKER_PAUSED:"true"};
const probe=createServer();await new Promise((r,j)=>{probe.once("error",()=>j(Error("OWN_TEST_PORT_OCCUPIED")));probe.listen(3450,"localhost",r);});await new Promise(r=>probe.close(r));
let serverLog="",log="";const startedAt=new Date().toISOString();
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","localhost","-p","3450"],{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});server.stdout.on("data",x=>serverLog+=x);server.stderr.on("data",x=>serverLog+=x);
try{
 let ready=false;for(let i=0;i<90;i++){try{if((await fetch(env.LHCI_BASE_URL+"/favicon.ico",{signal:AbortSignal.timeout(5000)})).ok){ready=true;break;}}catch{}await delay(500);}if(!ready)throw Error("OWN_BUILT_SERVER_NOT_READY");
 const child=spawn("cmd.exe",["/d","/s","/c","npm.cmd run test:lighthouse -- --config=.playwright/t22-lhci.config.js"],{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});child.stdout.on("data",x=>log+=x);child.stderr.on("data",x=>log+=x);const exitCode=await new Promise(r=>child.on("exit",r));writeFileSync(".playwright/t22-lighthouse-private.log",log);
 const routes=[];for(const f of (existsSync(".playwright/t22-lighthouse-current")?readdirSync(".playwright/t22-lighthouse-current"):[]).filter(f=>f.endsWith(".json")&&f!=="manifest.json")){const d=JSON.parse(readFileSync(".playwright/t22-lighthouse-current/"+f,"utf8"));if(!d.categories || Date.parse(d.fetchTime)<Date.parse(startedAt))continue;routes.push({route:new URL(d.requestedUrl).pathname,actualRoute:new URL(d.finalDisplayedUrl??d.finalUrl).pathname,fetchTime:d.fetchTime,performance:d.categories.performance.score,accessibility:d.categories.accessibility.score,seo:d.categories.seo.score,lcpMs:d.audits["largest-contentful-paint"].numericValue,cls:d.audits["cumulative-layout-shift"].numericValue,tbtMs:d.audits["total-blocking-time"].numericValue,runtimeError:d.runtimeError?.code??null});}
 assert.equal(routes.length,10,"CURRENT_RUN_REQUIRES_EXACTLY_TEN_ROUTES");
 const safe={sourceSha:process.env.T22_SOURCE_SHA,startedAt,endedAt:new Date().toISOString(),command:"npm.cmd run test:lighthouse -- --config=.playwright/t22-lhci.config.js",environment:"owned built Next on loopback; confirmed isolated DB; fresh cookie-free browser; no public upload",mode:"repository simulated defaults",thresholds:{performance:0.9,accessibility:0.95,seo:0.95},exitCode,routes,production:false,rum:false};writeFileSync(".playwright/t22-lighthouse-safe.json",JSON.stringify(safe,null,2));console.log(JSON.stringify({exitCode,routes:routes.length,underBudget:routes.filter(x=>x.performance<0.9||x.accessibility<0.95||x.seo<0.95).map(x=>({route:x.route,performance:x.performance,accessibility:x.accessibility,seo:x.seo})),production:false}));process.exitCode=exitCode;
}finally{server.kill();writeFileSync(".playwright/t22-lighthouse-server-private.log",serverLog);}

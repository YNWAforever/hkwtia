import {randomBytes} from "node:crypto";
import {spawn} from "node:child_process";
import {writeFileSync,readFileSync} from "node:fs";
import {setTimeout as delay} from "node:timers/promises";
const observeAuth=Number(process.env.T22_AUTH_PROVIDER_MIN_INTERVAL_MS??0)>0 || process.env.T22_AUTH_TELEMETRY_IMPORT==="1" || /t22-(?:browser|legacy)-release-final\.json$/.test(process.env.T22_REPORT_PATH??"");
if(observeAuth)writeFileSync(".playwright/t22-auth-upstream-safe.jsonl","");
const env={...process.env,PLAYWRIGHT_STORAGE_STATE:"",VERCEL_SHARE_TOKEN:"",VERCEL_ENV:"preview",EMAIL_FROM:"HKWTIA isolated acceptance <testing@example.test>",UNSUBSCRIBE_TOKEN_SECRET:process.env.UNSUBSCRIBE_TOKEN_SECRET??randomBytes(32).toString("hex"),ADMIN_BATCH_ENABLED:"true",MEMBER_IMPORT_ENABLED:"true",MEMBER_EXPORT_ENABLED:"true",EVENT_ATTENDEE_EXPORT_ENABLED:"true",MEMBERSHIP_GRANTS_ENABLED:"true",MEMBERSHIP_GRANT_BATCH_ENABLED:"true",MEMBER_COMMUNICATION_BATCH_ENABLED:"true",TICKET_RESEND_BATCH_ENABLED:"true",PAYMENT_RECONCILIATION_ENABLED:"true",M4A_DETERMINISTIC_ACCEPTANCE:"true",M4A_DETERMINISTIC_ACCEPTANCE_AUTHORIZED:"true",CONCIERGE_COOKIE_SECRET:randomBytes(32).toString("hex"),M4B_E2E_ALLOWED_ORIGIN:"http://localhost:3450",NEXT_PUBLIC_SITE_URL:"http://localhost:3450",CMS_SERVER_DRAFTS_ENABLED:"true",AUDIT_ISOLATED_ACCEPTANCE:process.env.T22_LEGACY_BROWSER_FLAG==="1"?"1":"true",PLAYWRIGHT_BASE_URL:"http://localhost:3450",APP_URL:"http://localhost:3450",NODE_OPTIONS:"--max-old-space-size=4096"+(observeAuth?" --import="+new URL("./t22-auth-provider-observer.mjs",import.meta.url).href:"")};
if(env.DATABASE_URL!==env.DATABASE_URL_TEST || new URL(env.DATABASE_URL_TEST).hostname!=="ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech" || env.NEON_PROJECT_ID!=="solitary-wave-52860119" || env.AUDIT_BATCH_WORKER_PAUSED!=="true")throw Error("CONFIRMED_ISOLATED_REQUIRED");
const {createServer}=await import("node:net");const portProbe=createServer();await new Promise((resolve,reject)=>{portProbe.once("error",()=>reject(Error("OWN_TEST_PORT_OCCUPIED")));portProbe.listen(3450,"localhost",resolve);});await new Promise(resolve=>portProbe.close(resolve));
const profile=process.env.T22_BROWSER_PROFILE??"isolated";
if(!["isolated","credential-free","local-deterministic"].includes(profile))throw Error("UNKNOWN_BROWSER_PROFILE");
if(!env.STRIPE_SECRET_KEY?.startsWith("sk_test_")||env.STRIPE_SECRET_KEY!==env.STRIPE_TEST_SECRET_KEY)throw Error("STRIPE_TEST_ONLY_REQUIRED");
if(profile==="credential-free"){
 for(const key of Object.keys(env))if(/^(DATABASE_URL|NEON_AUTH_|STRIPE_|M2_TEST_)/.test(key))env[key]="";
 for(const key of ["ADMIN_BATCH_ENABLED","MEMBER_IMPORT_ENABLED","MEMBER_EXPORT_ENABLED","EVENT_ATTENDEE_EXPORT_ENABLED","MEMBERSHIP_GRANTS_ENABLED","MEMBERSHIP_GRANT_BATCH_ENABLED","MEMBER_COMMUNICATION_BATCH_ENABLED","TICKET_RESEND_BATCH_ENABLED","PAYMENT_RECONCILIATION_ENABLED","CMS_SERVER_DRAFTS_ENABLED"])env[key]="false";
 env.M4A_DETERMINISTIC_ACCEPTANCE="false";
}else if(profile==="local-deterministic"){
 // The existing deterministic lane intentionally refuses all cloud environments.
 // These empty values also prevent Next's local dotenv loader restoring a cloud target.
 env.VERCEL="";env.VERCEL_ENV="";
}
let serverLog="",testLog="";
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","localhost","-p","3450"],{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
server.stdout.on("data",chunk=>serverLog+=chunk);server.stderr.on("data",chunk=>serverLog+=chunk);
try {
 let ready=false;for(let i=0;i<90;i++){try{const response=await fetch(env.PLAYWRIGHT_BASE_URL+"/favicon.ico",{signal:AbortSignal.timeout(5000)});if(response.ok){ready=true;break;}}catch{}await delay(500);}
 if(!ready)throw Error("OWN_BUILT_SERVER_NOT_READY");
 const test=spawn(process.execPath,env.T22_DIAGNOSTIC==="anonymous"?[".playwright/t22-anonymous-probe.mjs"]:env.T22_DIAGNOSTIC==="1"?["--import","tsx",".playwright/t22-boundary-diagnosis.mjs"]:["node_modules/@playwright/test/cli.js","test","--trace=off","--reporter=json,.playwright/t22-progress.cjs",...process.argv.slice(2)],{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
 test.stdout.on("data",chunk=>{testLog+=chunk;});test.stderr.on("data",chunk=>testLog+=chunk);
 const code=await new Promise(resolve=>test.on("exit",resolve));
 writeFileSync(process.env.T22_REPORT_PATH??".playwright/t22-e2e.json",testLog);console.log(JSON.stringify({e2eExitCode:code,report:".playwright/t22-e2e.json",production:false}));if(code!==0)process.exitCode=code;
 
}finally{
 if(observeAuth){
  const calls=readFileSync(".playwright/t22-auth-upstream-safe.jsonl","utf8").split("\n").filter(Boolean).map(x=>JSON.parse(x));
  writeFileSync((process.env.T22_REPORT_PATH??".playwright/t22-e2e.json")+".auth-safe.json",JSON.stringify({observedAt:new Date().toISOString(),profile:process.env.T22_REPORT_PATH,production:false,providerStubbed:false,cookieValuesLogged:false,bodyLogged:false,calls},null,2));
 }
 server.kill();writeFileSync((process.env.T22_REPORT_PATH??".playwright/t22-e2e.json")+".server-private.log",serverLog);}

import {spawn,execFileSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
import {setTimeout as delay} from "node:timers/promises";
const sourceSha=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
const rows=[];
async function run(name,args,extra={}){let raw="";const startedAt=new Date().toISOString();const child=spawn(process.execPath,args,{env:{...process.env,T22_SOURCE_SHA:sourceSha,...extra},windowsHide:true,stdio:["ignore","pipe","pipe"]});child.stdout.on("data",x=>raw+=x);child.stderr.on("data",x=>raw+=x);const exitCode=await new Promise(r=>child.on("exit",r));writeFileSync(".playwright/t22-release-"+name+"-private.log",raw);rows.push({sourceSha,name,startedAt,endedAt:new Date().toISOString(),exitCode});writeFileSync(".playwright/t22-release-paced-gates-safe.json",JSON.stringify(rows,null,2));console.log(JSON.stringify({name,exitCode}));if(exitCode!==0)process.exitCode=1;await delay(2000);return exitCode;}
for (const name of ["lint", "typecheck", "audit:strings"]) {
 const code = await run(name, [".playwright/t23-static-stage.mjs", name]);
 if (code !== 0) process.exitCode = 1;
}
const prefetch=await run("private-prefetch",[".playwright/t22-run-isolated.mjs",".playwright/t22-e2e.mjs","tests/e2e/admin-private-navigation.spec.ts","--workers=1"],{T22_LEGACY_BROWSER_FLAG:"1",T22_REPORT_PATH:".playwright/t22-prefetch-paced.json",T22_AUTH_PROVIDER_MIN_INTERVAL_MS:"2000"});
if(prefetch!==0){process.exitCode=1;}else{
 // Full current-source unit collection is verified from both native GitHub CI shards.
 // The prior d87 full local run remains separately archived; it is not relabelled.
 await run("full-browser",[".playwright/t22-run-isolated.mjs",".playwright/t22-e2e.mjs","--workers=1"],{T22_REPORT_PATH:".playwright/t22-browser-release-paced.json",T22_AUTH_PROVIDER_MIN_INTERVAL_MS:"2000"});
 await run("legacy-browser",[".playwright/t22-run-isolated.mjs",".playwright/t22-e2e.mjs","tests/e2e/full-application-cases.spec.ts","tests/e2e/full-application-resume.spec.ts","tests/e2e/full-campaign-review.spec.ts","tests/e2e/full-cms-history.spec.ts","tests/e2e/full-grant-governance.spec.ts","tests/e2e/full-job-health.spec.ts","tests/e2e/full-member-renewal.spec.ts","tests/e2e/full-segment-pagination.spec.ts","--workers=1"],{T22_LEGACY_BROWSER_FLAG:"1",T22_REPORT_PATH:".playwright/t22-legacy-release-paced.json",T22_AUTH_PROVIDER_MIN_INTERVAL_MS:"2000"});
 await run("concierge",[".playwright/t22-run-isolated.mjs",".playwright/t22-e2e.mjs","tests/e2e/concierge.spec.ts","--workers=1"],{T22_BROWSER_PROFILE:"local-deterministic",T22_REPORT_PATH:".playwright/t22-concierge-release-final.json"});
 await run("credential-free",[".playwright/t22-run-isolated.mjs",".playwright/t22-e2e.mjs","tests/e2e/wisetech-pr5-public-journeys.spec.ts","tests/e2e/public-footer-controls.spec.ts","--workers=1"],{T22_BROWSER_PROFILE:"credential-free",T22_REPORT_PATH:".playwright/t22-credential-free-release-final.json"});
 await run("lighthouse",[".playwright/t22-run-isolated.mjs",".playwright/t22-lighthouse-final.mjs"],{T22_SOURCE_SHA:sourceSha});
}

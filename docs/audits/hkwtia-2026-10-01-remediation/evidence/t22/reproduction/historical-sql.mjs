import {spawn} from "node:child_process";
import {writeFileSync,readFileSync} from "node:fs";
import assert from "node:assert/strict";
const reportPath=process.env.T22_SQL_REPORT_PATH??".playwright/t22-existing-sql-final.json";
const targets=JSON.parse(readFileSync(".playwright/t22-existing-sql-targets.json","utf8"));
assert.equal(targets.length,52);assert.ok(targets.every(x=>/^tests\/(integration|unit)\/[a-z0-9-]+\.test\.ts$/.test(x)));
const env={...process.env,NODE_OPTIONS:"",DATABASE_URL:"",DATABASE_URL_TEST:"",RUN_POSTGRES_INTEGRATION:"1",EMAIL_DELIVERY_MODE:"test",RUN_LIVE_WOZTELL:"0"};
for(const key of Object.keys(env))if(/^(NEON_AUTH_|STRIPE_|M2_TEST_)/.test(key))env[key]="";
const child=spawn(process.execPath,["node_modules/vitest/vitest.mjs","run",...targets,"--maxWorkers=1","--reporter=json","--outputFile="+reportPath],{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});let raw="";child.stdout.on("data",x=>raw+=x);child.stderr.on("data",x=>raw+=x);const code=await new Promise(r=>child.on("exit",r));writeFileSync(".playwright/t22-existing-sql-final-private.log",raw);const d=JSON.parse(readFileSync(reportPath,"utf8"));console.log(JSON.stringify({exitCode:code,pass:d.numPassedTests,fail:d.numFailedTests,skip:d.numPendingTests,total:d.numTotalTests,environment:"owned disposable PostgreSQL 16",targetFiles:targets.length}));process.exitCode=code;

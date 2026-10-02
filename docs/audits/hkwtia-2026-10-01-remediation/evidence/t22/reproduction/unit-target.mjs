import {spawn} from "node:child_process";import {writeFileSync,readFileSync} from "node:fs";
const env={...process.env,NODE_OPTIONS:"",RUN_POSTGRES_INTEGRATION:"0",RUN_AUDIT_LOAD:"0",RUN_AUDIT_FULL_MATRIX:"0",DATABASE_URL:"",DATABASE_URL_TEST:"",RUN_LIVE_WOZTELL:"0"};
for(const key of Object.keys(env))if(/^(NEON_AUTH_|STRIPE_|M2_TEST_)/.test(key))env[key]="";
delete env.EMAIL_DELIVERY_MODE;
const report=process.env.T22_UNIT_REPORT_PATH??".playwright/t22-unit-target.json";
const child=spawn(process.execPath,["node_modules/vitest/vitest.mjs","run",...process.argv.slice(2),"--maxWorkers=1","--reporter=json","--outputFile="+report],{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});let raw="";child.stdout.on("data",x=>raw+=x);child.stderr.on("data",x=>raw+=x);const code=await new Promise(r=>child.on("exit",r));writeFileSync(report+".private.log",raw);const d=JSON.parse(readFileSync(report,"utf8"));console.log(JSON.stringify({exitCode:code,pass:d.numPassedTests,fail:d.numFailedTests,skip:d.numPendingTests,total:d.numTotalTests}));process.exitCode=code;

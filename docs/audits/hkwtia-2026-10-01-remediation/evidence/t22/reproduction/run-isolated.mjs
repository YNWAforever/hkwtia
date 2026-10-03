import {parseEnv} from "node:util";
import {readFileSync} from "node:fs";
import {spawn,execFileSync} from "node:child_process";
import assert from "node:assert/strict";
const parsed=parseEnv(readFileSync(".env.local","utf8"));
assert.equal(new URL(parsed.DATABASE_URL).hostname,"ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech");assert.equal(parsed.DATABASE_URL,parsed.DATABASE_URL_TEST);
const env={...process.env,...parsed,AUDIT_SOURCE_SHA:process.env.T22_SOURCE_SHA??execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),NODE_OPTIONS:"",EMAIL_DELIVERY_MODE:"test",RUN_LIVE_WOZTELL:"0",AUDIT_ISOLATED_ACCEPTANCE:"true",AUDIT_BATCH_WORKER_PAUSED:"true"};
const child=spawn(process.execPath,process.argv.slice(2),{env,windowsHide:true,stdio:"inherit"});process.exitCode=await new Promise(resolve=>child.on("exit",resolve));

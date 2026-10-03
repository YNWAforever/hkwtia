import {spawn} from "node:child_process";
import {writeFileSync} from "node:fs";
const name=process.argv[2];if(!["lint","typecheck","audit:strings"].includes(name))throw Error("STATIC_COMMAND_REQUIRED");
let raw="";const child=spawn("npm.cmd",["run",name],{shell:true,windowsHide:true,env:{...process.env,NODE_OPTIONS:""},stdio:["ignore","pipe","pipe"]});child.stdout.on("data",x=>raw+=x);child.stderr.on("data",x=>raw+=x);const exitCode=await new Promise(r=>child.on("exit",r));writeFileSync(".playwright/t22-static-"+name.replace(":","-")+"-private.log",raw);console.log(JSON.stringify({command:"npm.cmd run "+name,exitCode,warningLines:name==="lint"?raw.split("\n").filter(x=>/\bwarning\b/.test(x)).length:undefined}));process.exitCode=exitCode;

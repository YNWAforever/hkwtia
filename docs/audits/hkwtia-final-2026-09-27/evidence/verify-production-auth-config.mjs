import {chromium} from "playwright";
import fs from "node:fs";
const base="https://hkwtia.vercel.app";
const receipt={checkedAt:new Date().toISOString(),deploymentId:"dpl_4FisCUU1aiJ73UChjk7SBkjUgW2A",checks:[],realEmailSent:false,googleAccountAuthenticated:false};
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 for(const path of ["/admin-login","/zh/admin-login","/member-login","/zh/member-login"]){
  const response=await page.goto(base+path,{waitUntil:"networkidle"});
  const google=page.getByRole("button",{name:/Google/});
  const enabled=await google.isEnabled();
  receipt.checks.push({path,httpStatus:response.status(),googleEnabled:enabled});
  if(!enabled)throw Error("Google disabled");
 }
 for(const [path,data] of [
  ["/api/auth/sign-in/email",{email:"auth-diagnostic-20260928@example.test",password:"synthetic-invalid-diagnostic-only"}],
  ["/api/auth/sign-in/magic-link",{email:"not-an-email",callbackURL:"/zh/admin-login?next=%2Fadmin"}]
 ]){
  const response=await page.request.post(base+path,{data,headers:{origin:base}});
  const body=await response.json();
  const code=body.code??body.error?.code??body.error??null;
  receipt.checks.push({path,httpStatus:response.status(),errorCode:typeof code==="string"?code:null});
  if(response.status()>=500||code==="LIMITER_UNAVAILABLE"||response.ok())throw Error("Unexpected diagnostic response");
 }
 await page.goto(base+"/zh/admin-login",{waitUntil:"networkidle"});
 await page.screenshot({path:"docs/audits/hkwtia-final-2026-09-27/evidence/production-admin-login-enabled-2026-09-28.png",fullPage:true});
 await page.getByRole("button",{name:/Google/}).click();
 await page.waitForURL(u=>u.hostname==="accounts.google.com",{timeout:30000});
 receipt.googleDestination={origin:new URL(page.url()).origin,path:new URL(page.url()).pathname};
 receipt.googleBrowserRedirectPassed=true;
 fs.writeFileSync("docs/audits/hkwtia-final-2026-09-27/evidence/production-auth-config-repair-2026-09-28.json",JSON.stringify(receipt,null,2)+"\n");
 console.log(JSON.stringify(receipt));
}catch(e){console.error(JSON.stringify({failed:true,reason:e.message,checks:receipt.checks}));process.exitCode=1;}finally{await browser.close();}

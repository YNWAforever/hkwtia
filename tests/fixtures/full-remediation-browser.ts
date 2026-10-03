import {expect,type BrowserContext} from '@playwright/test';
export async function signInRemediationIdentity(context:BrowserContext,baseURL:string,role:'SUPERADMIN'|'STAFF'='SUPERADMIN'){
 expect(process.env.AUDIT_ISOLATED_ACCEPTANCE).toBe('1');
 expect(process.env.NEON_PROJECT_ID).toBe('solitary-wave-52860119');
 expect(new URL(process.env.DATABASE_URL_TEST!).hostname).toBe('ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech');
 expect(new URL(baseURL).hostname).not.toBe('hkwtia.vercel.app');
 const email=process.env['M2_TEST_'+role+'_EMAIL'],password=process.env['M2_TEST_'+role+'_PASSWORD'];
 expect(email).toMatch(/@.*example\.test$/);expect(Boolean(password)).toBe(true);
 const response=await context.request.post('/api/auth/sign-in/email',{headers:{Origin:baseURL},data:{email,password,callbackURL:'/admin'}});
 expect(response.status()).toBe(200);
}

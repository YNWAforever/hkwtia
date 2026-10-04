import {expect,it,vi} from 'vitest';
import {productionTicketEmailDependencies} from '@/lib/billing/ticket-email-runner';
it('isolated Preview sink constructs ticket dependencies without live keys',()=>{
vi.stubEnv('NODE_ENV','production');vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('EMAIL_DELIVERY_MODE','test');vi.stubEnv('APP_URL','http://localhost:3450');vi.stubEnv('TICKET_PASS_TOKEN_SECRET','a'.repeat(64));vi.stubEnv('RESEND_API_KEY',undefined);
expect(()=>productionTicketEmailDependencies()).not.toThrow();
vi.unstubAllEnvs();
});

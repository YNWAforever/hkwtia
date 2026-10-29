import {afterEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({actor:vi.fn(),publish:vi.fn(),respond:vi.fn()}));
vi.mock('@/lib/auth/actor',()=>({getActor:mocks.actor}));
vi.mock('@/lib/membership/supplement-binding',()=>({createSupplementBinding:()=>({publish:mocks.publish,respond:mocks.respond})}));
import {publishSupplement,respondToSupplement} from '@/app/actions/supplements';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
describe('supplement authenticated action composition',()=>{
 it.each([publishSupplement,respondToSupplement])('disabled by default before Auth or SQL',async action=>{
  vi.stubEnv('HKWTIA_SUPPLEMENT_WRITES_ENABLED','false');
  expect(await action({})).toEqual({status:'forbidden'});expect(mocks.actor).not.toHaveBeenCalled();
  expect(mocks.publish).not.toHaveBeenCalled();expect(mocks.respond).not.toHaveBeenCalled();
 });
 it.each([publishSupplement,respondToSupplement])('refuses a missing session',async action=>{
  vi.stubEnv('HKWTIA_SUPPLEMENT_WRITES_ENABLED','true');mocks.actor.mockResolvedValue(null);
  expect(await action({actor:{kind:'staff'}})).toEqual({status:'forbidden'});
  expect(mocks.actor).toHaveBeenCalledOnce();expect(mocks.publish).not.toHaveBeenCalled();expect(mocks.respond).not.toHaveBeenCalled();
 });
 it('binds each operation to a fresh session resolver',async()=>{
  vi.stubEnv('HKWTIA_SUPPLEMENT_WRITES_ENABLED','true');mocks.actor.mockResolvedValue({kind:'staff',profileId:'synthetic',userId:'synthetic'});
  mocks.publish.mockResolvedValue({status:'saved'});mocks.respond.mockResolvedValue({status:'validation'});
  expect(await publishSupplement({requestId:'synthetic'})).toEqual({status:'saved'});
  expect(await respondToSupplement({requestId:'synthetic'})).toEqual({status:'validation'});
  expect(mocks.actor).toHaveBeenCalledTimes(2);
 });
});

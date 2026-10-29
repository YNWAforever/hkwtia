import {expect, it} from 'vitest';
import {createSupplementRepository} from '@/lib/db/repos/application-supplements';
it('rejects unscoped SQL transactions before loading the database',async()=>{
  let loaded=false;
  const repository=createSupplementRepository(async()=>{loaded=true;throw Error('UNEXPECTED_DB_LOAD');});
  await expect(repository.transaction(async()=>null)).rejects.toThrow('SUPPLEMENT_SCOPE_REQUIRED');
  expect(loaded).toBe(false);
});

import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {browserAcceptanceStatus} from '../fixtures/hkwtia-acceptance-status';

it('parses the committed inventory with exactly the 60 unique UC cases',()=>{
  const inventory=JSON.parse(readFileSync('docs/acceptance/hkwtia-20261025r1/t22-07-inventory.json','utf8'));
  expect(inventory.total).toBe(60);
  expect(inventory.cases).toHaveLength(60);
  expect(inventory.cases.map((entry:{id:string})=>entry.id)).toEqual(Array.from({length:60},(_,i)=>`UC22-${String(i+1).padStart(2,'0')}`));
  for(const entry of inventory.cases) {
    expect(['BLOCKED','NOT RUN','PARTIAL']).toContain(entry.status);
    expect(Array.isArray(entry.blockers)).toBe(true);
    expect(browserAcceptanceStatus(entry.status)).not.toBe('PASS');
  }
});
it('maps partial evidence to Auth/browser blocking and never permits PASS, even for hostile inputs',()=>{
  expect(browserAcceptanceStatus('PARTIAL')).toBe('BLOCKED: Auth/browser');
  expect(browserAcceptanceStatus('BLOCKED')).toBe('BLOCKED');
  expect(browserAcceptanceStatus('NOT RUN')).toBe('NOT RUN');
  for(const status of ['PASS','','unknown']) expect(browserAcceptanceStatus(status)).toBe('BLOCKED: Auth/browser');
});

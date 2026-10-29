import {existsSync} from 'node:fs';
import {test} from '@playwright/test';
import inventory from '../../docs/acceptance/hkwtia-20261025r1/t22-07-inventory.json' with {type:'json'};
import {browserAcceptanceStatus} from '../fixtures/hkwtia-acceptance-status';

// Session files are local secrets. Do not commit them or attach traces.
test.use({trace:'off',video:'off'});
if(process.env.HKWTIA_E2E_ACCEPTANCE==='1') {
  const states=[
    process.env.HKWTIA_E2E_MEMBER_A_STORAGE_STATE,
    process.env.HKWTIA_E2E_MEMBER_B_STORAGE_STATE,
    process.env.HKWTIA_E2E_STAFF_STORAGE_STATE,
  ];
  if(states.some(path=>!path || !existsSync(path))) {
    throw Error('HKWTIA acceptance requires real member A/B and staff storage-state files explicitly configured via HKWTIA_E2E_MEMBER_A_STORAGE_STATE, HKWTIA_E2E_MEMBER_B_STORAGE_STATE and HKWTIA_E2E_STAFF_STORAGE_STATE.');
  }
  // TODO: Verify real session identities/roles and isolated target, then implement
  // each original UC's browser assertions and evidence. File existence is not Auth.
  throw Error('HKWTIA acceptance Auth verification and browser scenarios are TODO; configured files alone cannot enable acceptance.');
}

test.describe('HKWTIA membership/admin acceptance inventory (scaffold)',()=>{
  for(const entry of inventory.cases) {
    const status=browserAcceptanceStatus(entry.status);
    const reason=[status,...entry.blockers,'Real Auth/browser acceptance is not implemented'].join('; ');
    test.skip(`${entry.id}: ${entry.theme}`,{
      annotation:[
        {type:'inventory-status',description:entry.status},
        {type:'acceptance-status',description:status},
        {type:'blockers',description:reason},
      ],
    },async()=>{
      // Fail loudly if someone removes skip without implementing the scenario.
      throw Error('TODO: real Auth/browser acceptance; inventory evidence cannot assert PASS');
    });
  }
});

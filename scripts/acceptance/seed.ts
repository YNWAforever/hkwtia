import {mkdirSync, writeFileSync} from 'node:fs';
import {localAcceptanceTarget} from './local-config';
import {seedHkwtiaFixtures} from './hkwtia-fixtures';

try {
  const target = localAcceptanceTarget();
  const manifest = await seedHkwtiaFixtures(target, process.argv[2] ?? 'r2-20261026-db');
  mkdirSync('.tmp/acceptance', {recursive:true,mode:0o700});
  writeFileSync('.tmp/acceptance/hkwtia-fixtures-private.json', JSON.stringify(manifest,null,2),{mode:0o600});
  console.log(JSON.stringify({seed:'PASS',profiles:manifest.profiles.length,authIdentitiesProvisioned:0,providerCalls:0}));
} catch {
  console.error('HKWTIA_ACCEPTANCE_SEED_FAILED');
  process.exitCode=1;
}

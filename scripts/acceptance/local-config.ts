import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import identity from './target-identity.json' with {type: 'json'};
import {verifyAcceptanceTarget} from './target.ts';

/** Explicit local-only loader; never print or serialize its return value. */
export function localAcceptanceTarget() {
  const local = parseEnv(readFileSync('.env.acceptance.local','utf8'));
  return verifyAcceptanceTarget({identity, environment: {...process.env, ...local, HKWTIA_ACCEPTANCE_SEED: 'true'}});
}

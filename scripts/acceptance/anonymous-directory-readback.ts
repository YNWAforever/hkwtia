import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {Pool} from '@neondatabase/serverless';
import {localAcceptanceTarget} from './local-config.ts';

// Read-only precondition: an absent fixture or failed DB read cannot prove isolation.
try {
  const target = localAcceptanceTarget();
  const fixture = JSON.parse(readFileSync('.tmp/acceptance/hkwtia-fixtures-private.json', 'utf8'));
  const pool = new Pool({connectionString: target.databaseUrl});
  try {
    const result = await pool.query('select display_name, directory_visible, public_profile_status from companies where id=$1', [fixture.companyId]);
    mkdirSync('.tmp/anon', {recursive: true, mode: 0o700});
    writeFileSync('.tmp/anon/directory-preflight.json', JSON.stringify({rows: result.rowCount, companies: result.rows}), {mode: 0o600});
    console.log(JSON.stringify({rows: result.rowCount, hidden: result.rows.length === 1 && result.rows.every(row => row.directory_visible === false && row.public_profile_status !== 'published')}));
  } finally {await pool.end();}
} catch {
  console.error('HKWTIA_ANONYMOUS_DIRECTORY_READBACK_FAILED');
  process.exitCode = 1;
}

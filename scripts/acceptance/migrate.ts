import {Pool, neonConfig} from '@neondatabase/serverless';
import {drizzle} from 'drizzle-orm/neon-serverless';
import {migrate} from 'drizzle-orm/neon-serverless/migrator';
import {localAcceptanceTarget} from './local-config.ts';

/** Same Drizzle journal and SQL as the standard CLI, through Neon's TLS WebSocket transport. */
export async function runAcceptanceMigration(): Promise<void> {
  const target = localAcceptanceTarget();
  neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({connectionString: target.databaseUrl, connectionTimeoutMillis:15000});
  try {
    await migrate(drizzle(pool), {migrationsFolder:'./drizzle'});
    console.log('HKWTIA_ACCEPTANCE_MIGRATION_PASS');
  } finally {await pool.end();}
}

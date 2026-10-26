import {spawn} from 'node:child_process';
import {localAcceptanceTarget} from './local-config.ts';

// Verify before creating a production-mode child. Never inherit ambient service credentials.
const target = localAcceptanceTarget();
const environment: NodeJS.ProcessEnv = {NODE_ENV: 'production'};
for (const key of ['PATH', 'HOME', 'TMPDIR', 'LANG']) environment[key] = process.env[key];
Object.assign(environment, {
  NODE_ENV: 'production', DATABASE_URL: target.databaseUrl,
  APP_URL: 'http://127.0.0.1:3212', NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3212',
  NEON_AUTH_BASE_URL: 'http://127.0.0.1:9',
  NEON_AUTH_COOKIE_SECRET: 'anonymous-local-dummy-auth-secret-000000000',
  CONCIERGE_COOKIE_SECRET: 'anonymous-local-dummy-concierge-secret-0000',
  AGENTS_ENABLED: 'false', NEXT_TELEMETRY_DISABLED: '1',
});
const mode = process.argv[2];
if (mode !== 'build' && mode !== 'start') throw Error('Expected build or start');
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', ...(mode === 'build'
  ? ['build', '--webpack'] : ['start', '--hostname', '127.0.0.1', '--port', '3212'])], {env: environment, stdio: 'inherit'});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
child.on('exit', code => {process.exitCode = code ?? 1;});

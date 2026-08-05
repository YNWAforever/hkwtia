# Worktree-safe Webpack workflow design

**Status:** Approved by the user on 2026-08-05 (option 1)

## Goal

Make the repository's local and CI-facing Next.js commands deterministic when a
Windows worktree has a junctioned `node_modules` directory. Turbopack rejects a
dependency junction that points outside the project root, while the existing
Webpack build already completes successfully. The workflow should select
Webpack explicitly instead of relying on Next.js's version-dependent default.

## Scope and boundaries

- Change only command wiring and its contract tests.
- `dev` uses `next dev --webpack`.
- `build` uses `next build --webpack`.
- Playwright's managed web server uses `next dev --webpack`.
- `start`, application code, route behavior, runtime data access, Vercel
  environment variables, Neon branches, Stripe configuration, and production
  deployments are unchanged.
- No `turbopack.root` workaround is added; the repository remains rooted at the
  actual application directory.

## Design

`package.json` is the single source of truth for normal developer commands.
Playwright's fallback `webServer.command` explicitly passes `--webpack` so
browser acceptance does not silently switch back to Turbopack. The existing
external-`PLAYWRIGHT_BASE_URL` path remains untouched for isolated Preview
acceptance.

The repository contract test will assert the new script values, and a focused
tooling contract will assert that the managed Playwright server contains the
Webpack flag. These tests guard the operational fix without coupling tests to
generated `.next` output.

## Verification

Run, in order:

1. Focused tooling contract tests (red before the change, green after it).
2. `npm.cmd run typecheck`.
3. `npm.cmd run lint` and `npm.cmd run audit:strings`.
4. `npm.cmd test`.
5. `npm.cmd run build` (now explicitly Webpack).
6. The M6 Playwright acceptance spec through the managed Webpack server.

The change is complete only when the default commands pass in the isolated
worktree and no production/shared environment is touched.

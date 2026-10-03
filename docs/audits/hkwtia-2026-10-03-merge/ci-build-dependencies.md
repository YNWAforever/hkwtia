# PR merge security gate — 2026-10-03

## Observed failure and cause

Fresh CI on the unchanged remediation stack failed `npm audit --omit=dev --audit-level=high` after the publication of [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Local reproduction reported five high-severity package entries in the production scope: `braces`, `chokidar`, `fast-glob`, `micromatch`, and `tailwindcss`.

`tailwindcss-animate` is imported only by `tailwind.config.ts`. Listing that compiler plugin as a runtime dependency promoted its Tailwind peer and build-time brace/glob parsers into the production install. The installed Next.js 16 Tailwind v3 guide and [Tailwind v3 PostCSS instructions](https://v3.tailwindcss.com/docs/installation/using-postcss) classify this tooling as development dependencies.

## Focused change

Move `tailwindcss-animate` from `dependencies` to `devDependencies`, regenerate dependency scope flags, and retain every original lockfile package version, resolved URL and integrity value, including the optional Auth peer entries. No framework, Auth, payment or application source changes. The CI high-severity threshold is unchanged.

## Verification

- RED: existing production audit exited 1 with the high-severity compiler dependency chain.
- GREEN: `npm audit --omit=dev --audit-level=high --json` exited 0; high 0, critical 0, moderate 9 on the current lockfile.
- Actual PostCSS compilation with the unchanged Tailwind config generated `.animate-in`, `.fade-in`, `.slide-in-from-bottom-2` and `@keyframes enter`; CSS SHA-256 `5b4202ed66b1dadf32c2ddbd59a816db7e8cd83456bf5290e5ff47b26ccaf4d4`.
- The clean production-install receipt and current PR CI links are recorded separately after they finish. They are not inferred from the local audit result.

The upstream `braces` issue remains in development tooling and has no patched release at this verification time. This change corrects deployment scope; it does not claim to patch the upstream parser or eliminate the moderate advisories. Builds must continue to use trusted configuration and controlled build inputs.

## Release boundary

The Vercel production branch is `release`. These merges target `main`; no Production branch update, database migration, feature flag enablement or effectful member/provider operation is included. Existing staged-release and policy gates remain in force. Revert this focused commit to restore the prior dependency classification; do not revert application migrations or historical rights as part of dependency rollback.

# Main-to-release cutover evidence

Date: 2026-09-02

## What happened

1. PR [#29](https://github.com/YNWAforever/hkwtia/pull/29) merged `feat/isolated-test-infrastructure`
   into `main` at `fb6ff4fd42f47594aa9cbfd5058b863906d47e5b`. CI (`quality`): pass.
2. The cutover probe (`origin/release` merge `origin/main`, discarded, never pushed) completed with
   no conflict — "Merge made by the 'ort' strategy," 279 files changed, no `CONFLICT` line.
3. PR [#30](https://github.com/YNWAforever/hkwtia/pull/30) merged `main` into `release` at
   `b18990c1f7260441d127144e1d228ba5a1e6b9b7`. CI (`quality`): pass, 6m50s.
4. Vercel deployment `dpl_7M8itr8LkoE5ifJVAa5dJxgd87rF` reached `READY`, `target: "production"`,
   commit `b18990c1f7260441d127144e1d228ba5a1e6b9b7` — confirmed via `get_deployment`, including
   `hkwtia.vercel.app` appearing in its alias list once ready. Smoke check:
   `https://hkwtia.vercel.app` returned `200`.

## What this does not establish

Delivery gates 2 (isolated test infrastructure), 3 (Preview/UAT) and 4 (production approval) remain
`NOT PASSED` per `docs/integration/wisetech-delivery-gates.md`. No isolated Neon branch, test
identity, or provider test configuration was ever created. No independent UAT owner reviewed this.
This was a direct, owner-directed production deployment, recorded here so that fact stays legible.

# T22 actual browser regressions

## Native registered-media selection

Full Chromium reproduced native input(index=1) followed by change(index=0): parent dirty-state rerender restored the old selection before change. The regression unit reproduced the same event order with fresh registry rows (2 pass/1 target failure), then passed all 3 with input propagation stopped at the controlled select. Change continues to bubble, preserving dirty-state tracking. Real bilingual desktop/mobile keyboard Home/ArrowDown/Tab now keeps input=1/change=1, renders an actual thumbnail, and creates zero events/uploads. Browser after: 7 pass/0 fail/0 skip across the related fixes.

## News and locale controls

Populated news/build-log metadata measured 3.73:1 on white. The shared archive-card scope now uses the existing readable palette; both news routes pass serious/critical axe. Locale Suspense fallback now remains disabled until its handler exists; the meaningful unit failure and passing query/repeated-values/fragment browser case are retained.

## Environment and limits

Confirmed isolated Neon/Auth only. Current build uses exact loopback origin; no authorization or provider guard disabled. The first full browser collection remains 302 pass/35 fail/150 skip; focused repairs do not erase that result. Fresh isolated English import passed the actual preview/commit/private report/idempotency workflow. CMS draft/publication/revert passed; public copy was restored through audited publication. Complete final profile runs are recorded separately.

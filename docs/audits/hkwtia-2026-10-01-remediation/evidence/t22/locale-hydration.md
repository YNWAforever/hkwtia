# Locale click readiness

Real built Chromium public-shell run retained `/events` after the first locale click. The server-rendered button was enabled before its client event handler existed. A new ready-SSR unit regression first failed on this exact disabled-control behavior (12 pass/1 target fail), then passed with the existing Suspense regression and real client switching tests. The minimum change uses React useSyncExternalStore server/client snapshots to disable only until hydration is ready; existing path, repeated queries, fragment, CMS beforeSwitch and locale routing remain.

The same run's four mobile size failures received undefined bounding boxes during hydration replacement, not a measured size below 44px. Browser assertions now retry actual visible dimensions with the same 44px threshold. No CSS geometry change or threshold relaxation.

Safe RED/GREEN receipts: locale-ssr-red.json, final-focused.json. Raw logs stay ignored.

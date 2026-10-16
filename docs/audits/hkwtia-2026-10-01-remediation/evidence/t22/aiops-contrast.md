# AI-Ops contrast regression

Actual serious contrast failures in both locales: the dark homepage palette was reused on the light AI-Ops page. Safe before receipts retain only rule/selectors/colors/ratios.

The metric component now marks its own grid. Specific overrides in the actual shell stylesheet give only these light-page cards readable ink/background/borders; the homepage palette is preserved. Generated wisetech.css is unchanged.

Actual built Chromium: English and Traditional Chinese each verify eight metrics, two published build logs, renewal rows, mobile overflow, exclusion of private/canary fields, and no serious/critical axe violations. Both passed in t22-recovery-d. Synthetic isolated fixtures are not provider or production acceptance.

Command: `node .playwright/t22-run-isolated.mjs .playwright/t22-e2e.mjs tests/e2e/m4c-aiops.spec.ts --workers=1`. The environment wrapper verifies exact isolated host/equal DB URLs. Before reports exposed the target behavior, then app was rebuilt and both locale checks passed. See aiops-contrast-before-*.json and aiops-contrast-after.json.

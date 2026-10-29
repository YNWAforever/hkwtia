# Dependency disposition — 2026-10-25 R1

Runtime: Node 22.23.4 / npm 10.9.9, 4 GiB heap. Next retained at 16.4.3. Separate initial/final audit JSON artifacts are retained. Initial omit-dev: 4 high; initial full: 20 high/1 critical. Final omit-dev: 0 high/critical (11 moderate), exit 0 at high threshold. Final full: 13 high/0 critical, exit 1. No severity gate changed.

Narrow overrides update Vite, browserslist, js-yaml, LHCI HTTP middleware and Neon Auth’s existing Zod 4 dependencies. Zod application dependency moved to 4.6.7 with resolver 5.9.2. Canonical Ajv optional peers restored after npm pruned them; CI contract is unchanged. Clean npm ci completed before restoring the canonical lock metadata.

## Accepted dev-only LHCI exception

Accepted in this run under the coordinator’s explicit instruction. Owner: release owner. Reason: @lhci/cli is test/tooling only, not application runtime. Review deadline: 2026-11-08 or before next release, whichever is earlier. This does not waive remote CI, identity, visual, or runtime release acceptance.

Evidence: package.json lists @lhci/cli only in devDependencies; test:lighthouse invokes lhci autorun; lighthouserc.js collects pages with Chromium and may start a local test server. No application module imports it (`rg` source check). lhci-dependency-path.json records npm explain. Production omit-dev audit excludes the LHCI paths. Exposure is tooling/browser/download/proxy/report input on the operator machine; trusted audited target and no untrusted archive/proxy inputs are required while retained. Exception does not claim the tooling vulnerabilities are fixed. Replacement/update of LHCI and its browser/archive chain is owned by release owner.

## Remaining high paths (all in accepted LHCI tooling tree)

| Package | Installed paths / versions | Advisory or propagated cause | Disposition |
| --- | --- | --- | --- |
| @lhci/cli | node_modules/@lhci/cli @ 0.15.1 | @lhci/utils; inquirer; lighthouse; proxy-agent; tmp; uuid | Accepted dev-only exception; no upstream compatible fix applied |
| @lhci/utils | node_modules/@lhci/utils @ 0.15.1 | lighthouse | Accepted dev-only exception; no upstream compatible fix applied |
| @puppeteer/browsers | node_modules/@puppeteer/browsers @ 2.13.2 | extract-zip; proxy-agent | Accepted dev-only exception; no upstream compatible fix applied |
| basic-ftp | node_modules/basic-ftp @ 5.3.1 | basic-ftp: Quadratic-time CPU denial of service in Client.list() Unix directory-listing parser (RE_LINE backtracking) (https://github.com/advisories/GHSA-c475-qrg2-pj4r) | Accepted dev-only exception; no upstream compatible fix applied |
| chromium-bidi | node_modules/chromium-bidi @ 14.0.0 | zod | Accepted dev-only exception; no upstream compatible fix applied |
| extract-zip | node_modules/extract-zip @ 2.0.1 | extract-zip unvalidated symlink path traversal (https://github.com/advisories/GHSA-jmr9-qjv8-65gv); extract-zip allows arbitrary file writes through symlink archive entries (https://github.com/advisories/GHSA-7pqw-9j4j-h8q3) | Accepted dev-only exception; no upstream compatible fix applied |
| get-uri | node_modules/get-uri @ 6.0.5 | basic-ftp | Accepted dev-only exception; no upstream compatible fix applied |
| lighthouse | node_modules/lighthouse @ 12.6.1 | puppeteer-core | Accepted dev-only exception; no upstream compatible fix applied |
| pac-proxy-agent | node_modules/pac-proxy-agent @ 7.2.0 | get-uri | Accepted dev-only exception; no upstream compatible fix applied |
| proxy-agent | node_modules/proxy-agent @ 6.5.0 | pac-proxy-agent | Accepted dev-only exception; no upstream compatible fix applied |
| puppeteer-core | node_modules/puppeteer-core @ 24.43.1 | @puppeteer/browsers; chromium-bidi | Accepted dev-only exception; no upstream compatible fix applied |
| tmp | node_modules/external-editor/node_modules/tmp @ 0.0.33; node_modules/tmp @ 0.1.0 | tmp allows arbitrary temporary file / directory write via symbolic link `dir` parameter (https://github.com/advisories/GHSA-52f5-9888-hmc6); tmp has Path Traversal via unsanitized prefix/postfix that enables directory escape (https://github.com/advisories/GHSA-ph9p-34f9-6g65) | Accepted dev-only exception; no upstream compatible fix applied |
| zod | node_modules/chromium-bidi/node_modules/zod @ 3.25.76 | Zod can exhaust memory while validating oversized constrained collections (https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | Accepted dev-only exception; no upstream compatible fix applied |

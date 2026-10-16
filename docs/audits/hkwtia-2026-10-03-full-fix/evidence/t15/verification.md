# T15：實測列表、手機覆核及公開載入

狀態：程式與本機隔離回歸已驗；原有十條 Lighthouse 路線與全部門檻已通過。香港／新加坡、RUM、真人 screen reader 和 3–5 職員案件驗收尚未通過。沒有正式部署或旗標啟用。

## 修正與失敗證據

- 保留 owner/company-seat 可見性；會員 list/snapshot 用既有條件的 UNION ALL 可見集合，移除逐 profile BitmapOr。撤銷公司席位的缺陷注入會失敗，已還原正確 SQL。
- 列表預設 50；會員上限仍 50，草稿與 inbox repository 上限 100，inbox 畫面 50。hidden limit、篩選、分頁與選取範圍一致。
- 390px 審批摘要最少 288px，表格可聚焦／鍵盤捲動；中英計劃名称、覆核狀態、時區提示及 health link 維持正確標籤。
- 客服對話 chunk 延至點擊或既有開啟事件；載入失敗有重試／人工入會及聯絡，焦點與 Esc 回復。安全503保留問題，沒有假稱建立案件或發送。
- 活動／會籍 hero 不等 repository；會籍下方內容一併等待 catalogue，避免先顯示再移位。系統 loading keys 放 Common，不增加 CMS 可編輯欄位。原 CMS 113→114 失敗及修正保留。
- 真公開活動頁曾一次輸出282 cards／約5400 DOM；新增 limit12/offset 分頁，重用原 count/filter/order/visibility。現在約490 DOM；所有活動仍有頁面入口，uncapped count 與 sitemap 不變。
- 首頁首次圖片請求約1.1秒。原照片 bytes/hash 不變，離線生成480/960/1800 WebP；固定公開圖片例外受單元、原照片 provenance 及真 browser currentSrc 驗證。私人媒體 revocation-aware delivery 不變。

## 實際測試與界線

| 驗證 | 結果／證據 |
|---|---|
| 1k/10k SQL、EXPLAIN、filter/keyset/count/snapshot | 37 pass /0fail/0skip；repository-scale-after-final-working-tree.json，pg-final-initial.txt |
| 公開活動真 PostgreSQL 分頁 | 1 pass；25 rows →12/12/1，0重複／0私有或草稿；public-pagination-postgres.json |
| focused 分頁／status／filter／hero streaming | 58 pass；public-pagination-unit-red/green.txt（原11 behaviour failures） |
| 原照片、響應式 hero、圖片 policy | 345 pass；static-hero-unit-red/green.txt，original-policy failure retained |
| 真 Chromium／隔離 Neon password Auth | 12 pass；native-public-pagination-runtime.json、native-current.json；EN/HK390/1440、keyboard／drawer／same-browser identity、axe serious/critical0 |
| 完整 source CI、worker／lint／types／strings／build／security | ci-source.json；pass/fail/skip分列；skip不是pass。此前失敗原文保留 |
| Lighthouse 原10條 route／1run／門檻 | lighthouse-final-scores.json：10/10，performance0.93–0.98、a11y≥0.96、SEO1、CLS0；保留每輪失敗，不合併不同run或降低0.90/0.95/0.95 |

10k會員50 p95由432.1ms→194.0ms；filtered99.4ms、report464.9ms、draft190.3ms，list最多51 rows含next sentinel。report SQL未修改，不宣稱其改善。每項20samples；heap包含GC/共享主機噪音。此為loopback repository結果，不是Production或区域延遲。

本機每語言3次 browser-cache cleared/warm 共12samples；可操作時間≤3秒。DB/app cache未清空，無TLS，網絡未節流；這不是HK/SG3cold3warm或RUM。axe0不代表完整WCAG或真人任務通過。

## 精確命令

- `RUN_POSTGRES_INTEGRATION=1 node node_modules/vitest/vitest.mjs run tests/integration/admin-workflow-performance.test.ts tests/integration/admin-batch-snapshot.test.ts tests/integration/audit-full-batch-snapshot.test.ts --reporter=verbose`
- `RUN_POSTGRES_INTEGRATION=1 node node_modules/vitest/vitest.mjs run tests/integration/public-event-pagination.test.ts`
- `node node_modules/vitest/vitest.mjs run tests/unit/public-event-repository.test.ts tests/unit/wt-pages/events-page.test.tsx tests/unit/public-hero-streaming.test.tsx tests/unit/event-public-page.test.tsx tests/unit/event-filters.test.ts tests/unit/featured-public-event-query.test.ts`
- `node node_modules/vitest/vitest.mjs run tests/unit/home-hero.test.tsx tests/unit/wisetech-asset-provenance.test.ts tests/unit/image-render-policy.test.ts`
- `node --import tsx scripts/precompute-home-hero.mjs`（只處理固定公開照片，先驗原hash）
- `node --env-file=.env.local scripts/verify-full-admin-usability.mjs --final-t15`
- `node --env-file=.env.local scripts/verify-full-admin-usability.mjs --lighthouse`（執行原 npm run test:lighthouse，僅managed Chrome/owned localhost/本機輸出；原threshold/order/count不變）
- `node --env-file=.env.local scripts/verify-full-admin-usability-preview.mjs`（僅已批准隔離Preview）

Google／magic-link、真provider／cloud worker窗口、真人／region／RUM及Production仍各有門檻。Chrome DevTools MCP未提供；使用現有Lighthouse JSON及真Chromium DOM/network診斷，不冒充DevTools trace。

最終應用source `145443b69df74ad2f70af172c310d10e05803220`，build `5gfh3thCdYeh6P09ogzeq`；CI37229996430兩shards完整6771pass590skip0fail，worker57。各回執有自己的source/hash；不是把focused結果相加成完整suite。

最後Preview：`145443b6`／`dpl_7naz7ueCt1AXR6UeEPBwvX36TGEy`，https://hkwtia-usability-20261003.vercel.app；唯一合成marker正向證明DB、ledger61、10 route smoke及2真password-Auth native cases通過。Production未變。

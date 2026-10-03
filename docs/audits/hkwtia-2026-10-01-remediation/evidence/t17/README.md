# T17：私人 CMS 草稿、發布及媒體搜尋

## 已驗證範圍

現有 page-copy repository/action/CAS/audit/public cache 延伸為私人保存、明確發布及歷史回復；沒有另建 public copy 系統。Home 166 keys 依區塊分頁，最多20組中英欄位；未顯示的值以 hidden inputs 保留完整 FormData。T04 的24小時 session recovery 繼續保留。跨裝置草稿屬同一 authenticated profile；不能用相同電郵合併權限。

0056 新表及 sequence 只於已核對隔離 Neon 執行，ledger55→56；公開文案、會籍及訂單 fingerprint 不變。flag 預設 false。公開讀取只走原 page_copy，preview 只允許本人未發布 Home 草稿，private/no-store/noindex。其他 namespaces 可用同一私人保存與發布；實際共享首頁版面 preview 僅 Home，其他維持既有文字 preview。

## 行為失敗與修正

- 新 editor 流程的 block/search 缺失及欄位清楚識別先失敗；改成有界區塊及唯一雙語 labels。
- 舊 action 在新 workspace flag 開啟時仍直接寫 public copy；新測試先重現，再拒絕弱入口，保留 flag-off 既有相容行為。
- 暫時重新引入私人 save 的 public write，實際 PostgreSQL privacy test 觀察公開值意外改變；復原原始檔案後通過。此反例未提交。
- 成功 action 的 React form reset 令 block selector 回到 metaTitle、hero 欄位卻保留；測試先失敗，再把純篩選控制移出表單。
- 媒體選項於成功 action reset 變空；測試先失敗，同步原生 option reset defaults，保留控制項及焦點。onReset preventDefault 的嘗試仍失敗，沒有保留該無效修正。
- 初次 full suite 的2失敗：舊 EventForm fixture 缺新搜尋 label，及 image policy 未列出新 exact-private-delivery consumer。補齊 fixture 及既有條件式例外；仍禁止 raw img、任意 optimizer bypass、任意外部 URL。

SQL fixture auth FK、錯誤 catalog key、Testing Library 不支援 exact 選項、跨裝置 Auth user/profile 電郵混用查詢，均是測試設置失敗，不計為產品修正或成功驗收。

## 真交易及瀏覽器

focused.json：211 pass/0 skip/0 fail，9真 PostgreSQL +202 unit/actor/UI。CAS、兩位 editor、audit failure 整筆回滾、兩語發布、舊版回復產生新 revision、ABA、private owner、明確 rebase 只保留自己改過欄位及新 public 值均有真 SQL 證據。另335 regressions pass。

browser.json：實際 built Next16.3.6、隔離 Neon/Auth、合成 staff/superadmin；私存→另一裝置→中英同一真正首頁組件→鍵盤明確發布→另一編輯 CAS 衝突→私存回復→明確發布原始 public snapshot。匿名及其他編輯拒絕，兩位測試 editor 最後無 open draft；發布歷史及 audit 保留，無 production writes。全頁 preview 的延後內容不能當作全部區塊視覺驗收；viewport 圖只記錄當次實際載入區段。

媒體驗收另記 media-browser.json，79合成 registry fixtures 使用現有真靜態圖片，沒有 R2 upload、event writes 或 provider sends。原生選單的 keyboard focus 與 browser selectOption 分開記錄；Windows headless popup 的 Arrow/End 模擬失敗，不聲稱完整鍵盤選取已通過。

## 路徑映射

- 擬 lib/admin/page-copy-drafts.ts → 現有 lib/db/repos/page-copy.ts 與 lib/admin/page-copy-actions.ts。
- 擬 audit-full-cms-publish.test.ts → tests/integration/audit-full-cms-workspace.test.ts。
- 擬 full-cms-workspace.spec.ts → tests/e2e/cms-publish.spec.ts。
- public Home 與本人 preview 共用 components/home/home-content.tsx；局部文案 overlay 位於 lib/home/copy-preview.ts，不污染 public/global cache。
- 媒體沿用 mediaRepository/listActiveForAdmin 及原註冊/儲存架構；沒有新上傳平台。

## Rollout / rollback

先停用新 CMS flag；套用0056 additive schema；部署相容 app/private preview；核對 target/SHA/ledger；退休或排空舊 direct-write instances，再在已批准環境驗證後啟用。舊 writer 沒有新的 draft base token，不能在新 workflow 開啟時並行；此 mixed-writer 演練留T22。

回退先關 CMS_SERVER_DRAFTS_ENABLED 並停止新 CMS writes，保留 table/sequence/private drafts/publication history/audits；舊 app 仍讀原 page_copy。不可刪歷史或把未批准草稿直接公開。正式0056、flag enable、部署及舊 writer/compatible rollback 演練尚未批准／完成。

## 實際命令

- focused.json 記完整 Vitest 13檔命令。
- `node --env-file=.env.local .playwright/t17-browser.mjs`：owned built loopback server + `node node_modules/@playwright/test/cli.js test tests/e2e/cms-publish.spec.ts --reporter=line`，拒絕 skipped acceptance。
- `node --env-file=.env.local --import tsx .playwright/migrate-copy-isolated.mts`：exact project/host/sentinel/ledger guard，再調用現有 scripts/db-migrate.ts；詳 migration.json。
- 最終 full/lint/typecheck/strings/build 命令與實際結果於 verification.md 及 gates receipt；缺環境之 skip 另列，不計 pass。

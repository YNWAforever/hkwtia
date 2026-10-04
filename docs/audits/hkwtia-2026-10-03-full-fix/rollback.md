# 回退／前向修復（T16）

本輪未執行正式回退。證據範圍是owned loopback PostgreSQL16的pg_dump/pg_restore、51/56→61 additive migration、最後DDL後故障回復、exact歷史page-copy repository讀寫及new-writer flag-off。另以exact歷史web建置在新版隔離DB/Auth完成中英文會員列表與CMS private-save/publish/restore/audit（3/3）。其他舊版業務路徑、cloud worker binary及正式部署回退仍未驗證。

## 先停新工作

1. Release owner先把 `AGENTS_ENABLED=false`，再關相關ADMIN_AI purpose flags。舊worker可能忽略新purpose flags，因此頂層開關必須先停。
2. Pause新batch commit、generation及受影響sender dequeue；保留人工登入、會員查看、合法付款對帳及CMS已發布內容。關閉某個writer不等於取消已發生效果。
3. 保存deployment/worker SHA、operationId、snapshot/previewDigest、audit/outbox/claims/budget及provider receipt。只輸出遮罩摘要；不導出cookie、token、原始會員內容或完整secrets。
4. 已accepted或unknown先向provider查核；保留provider id、費用hold與claim。過期lease/TTL不代表未送達、退款完成或成本零，不盲重試。

## 切換與修復

- 比對本次manifest候選與上一個實際已驗版本。正式alias最後readback在 evidence/t16/production-readback.json；只在批准且確認仍相容時由release owner切回指定deployment。
- Schema維持additive；0057–0061與既有audit、immutable history、outbox、budget/claims/paid rows保留。錯誤以reviewed forward migration修復；不用DROP或還原過時整庫覆蓋新交易。
- 切換舊web/worker前，以restore副本執行exact旧版本的主要读写与授权；本輪已驗舊page-copy模組及exact歷史web的會員列表/CMS路徑；其他舊版主要業務路徑與cloud worker不能當通過。
- CMS內容可使用既有版本／CAS publication restore；history仍在。實際付款／退款／訊息不能靠git revert撤回。
- 恢復前核對journal hash/順序、data fingerprints、待對帳數量、未知費用及同意；逐項重新開啟已批准能力，觀察兩worker窗口。

## 已執行的隔離演練

`RUN_POSTGRES_INTEGRATION=1 node node_modules/vitest/vitest.mjs run tests/integration/audit-full-migration-recovery.test.ts`

環境由fixture自己建立pgvector/pgvector:pg16 loopback container，從不讀取DATABASE_URL。custom pg_dump使用實際PostgreSQL16，pg_restore帶 --exit-on-error / --no-owner / --no-acl，目標為同owned container的新生成DB。回執記backup bytes/hash，不把備份原文入PR。原56計數的RED與fixture actor错误分開保留；以最後完整3-case run為結果，不相加focused passes。

## owner／解除條件

Release owner指定正式rollback deployment與值班人；Worker owner提供scoped cloud service binding和兩窗口；Finance/Messaging向provider核實unknown；DB operator提供正式備份批准與restore fingerprint；WTIA policy/data owner批准逐能力政策。各項缺失只阻擋自己的發布／啟用。

### Exact historical web（已執行）

`node --env-file=.env.local --import tsx scripts/verify-full-rollback-web.mjs --reuse-build`

程式從git archive取得36ebae1dac68a7e0e420870cf0df68fa166b7874，package-lock保持一致，以原Next16.3.6建置。第一次建置成功；重用時逐一驗archive hash、runtime檔案bytes、config/lock与BUILD_ID。唯一合成marker正向證明runtime的隔離DB來源。真密碼Auth與server取得actor，不用mock session。原Home私有草稿導致保護檢查停止，因此改用沒有own草稿的About；未刪除Home工作。真server actions儲存私人draft、public不變、發布、previous-copy回復及第二次發布成功，public projection與原fingerprint完全一致且audit retained。回執：evidence/t16/historical-web-runtime.json / historical-cms.json。此範圍沒有付款、sender、AI或cloud worker effects。

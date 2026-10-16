# 舊 comp 入口盤點（T06）

核對範圍：50de2798 起的 governance worktree；本文件是程式 caller 盤點，不是正式資料清理授權。

| 路徑 | 原有作用 | 本輪處理 |
|---|---|---|
| lib/db/repos/admin-membership.ts | staff / ExCo / superadmin 可寫 active、沒有原因期限的 comp | 保留相容函式，先 requireAdmin，然後 LEGACY_COMP_RETIRED；不載入 DB |
| lib/admin/membership-comp-actions.ts | 可直接 HTTP dispatch 的舊 action | 每次重新解析 authenticated server actor；回繁中／英文 retired code；不採用客戶端 actor、profile 或訊息作決策 |
| lib/admin/membership-comp-action-core.ts | 舊 form adapter | 所有輸入只回退休狀態，不執行 supplied mutation |
| components/admin/membership-comp-form.tsx | 沒有期限的授予表單 | 只顯示特別會籍／付款核對說明，沒有寫入控制 |
| app/[locale]/(admin)/admin/members/[id]/page.tsx | Member360 的 comp binding | 取消 binding；保留既有 superadmin + MEMBERSHIP_GRANTS_ENABLED 有限期入口 |
| lib/db/repos/membership-grants.ts | 单筆和批次共用有限期寫入 | 保留同一 guard、plan seats 和 audit；單筆 action 加 actor scoped request receipt |
| lib/db/repos/batch-handlers/membership-grant.ts | 既有批次 grant handler | 继续使用 insertFiniteGrant，批次 actor/idempotency/CAS 契約不改；T14 完整批次驗收待辦 |
| tests/unit/admin-membership.test.ts / membership-comp-action.test.ts / membership-comp-form.test.tsx | 正向 comp fixtures | 改為 retired / zero writes / denied roles 回歸；不再要求弱入口成功 |
| tests/integration/membership-grant.test.ts | 既有有限期 grant SQL | 實際 PostgreSQL 16 重跑，6 pass / 0 skip |
| scripts/seed-m2.ts / tests/fixtures/full-remediation-fixture.ts | 隔離歷史會籍 fixtures | 未修改；fixture 並不構成正式 comp caller 或政策批准 |

## 重試、期限與歷史資料

單筆請求使用現有不可變、交易內 audit_events 的 membership.grant.created 記錄作 receipt，metadata 記錄 requestKey / requestDigest；advisory lock scope 為 authenticated actor + UUID。相同 key/相同 payload 回同一 grant ID；改 payload 拒絕；原 grant 已過期時重試只回舊結果，不再授權。沒有新增 ledger 或 migration。批次維持原有 admin_batches ledger。

沒有對任何歷史 comp/paid row 回填原因、期限或來源；null/null 權益保留。沒有從電郵推定權限、把已付款故障改為免費會籍，或刪除會員資料。

正式 legacy rows 的來源/批准/期限如缺失仍是未知；本輪沒有使用 Production PII 作 fixtures，也不虛構資料。正式只讀聚合盤點和付款核對的完整流程放在 T08 / T23 release gates，並不因這份 source 盤點而宣稱已完成。

## 實際驗證

- 修改前 3 個 retired-comp 行為失敗：staff / ExCo / superadmin promise 實際 resolved，而非應有的 retired refusal。
- 真 PostgreSQL 同 key 並發：修改前只有 1 fulfilled，修改後 2 fulfilled、同一 ID、一份 membership / audit；payload conflict 與 expired replay 通過。
- 歷史 indefinite row 前後 row_to_json 完全相同；期限到達邊界不有效。
- 35 focused / PostgreSQL tests pass、0 skip；Chromium 三角色 pass（繁中桌面 staff / ExCo，英文手機 superadmin）；單筆實際 UI grant 的 server actor、audit receipt 和無 Stripe identity 已核對。只刪除精確新建 synthetic fixture。
- HTTP wrappers / full suite / 建置另見 verification.md；完整 U23 付款核對與 U24 全站角色矩陣仍待 T08/T18/T22。

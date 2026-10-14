# HKWTIA Member Portal — Codex GPT-6.1 Sol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` 按任務逐項實作；若環境未提供該技能，依本文件原生執行。預設由 Codex GPT-6.1 Sol 在同一工作分支依次完成；不需要多代理。每個 `- [ ]` 都要有可查證結果才勾選。

**Goal:** 修復 Member Portal 的 12 項稽核發現，讓會員能完成會籍管理、公司維護、活動購票及資源使用，並由職員核實支援結果。

**Architecture:** 沿用既有 Next.js Server Components、authenticated action → server-only core → actor-scoped repository 的分層。修正選擇與資料契約，保留 DB 權限、會籍政策、金流及通知的既有保護；需要新頁面時接入現有 Portal shell。查詢效能落在 SQL 與 request scope，不用跨會員快取掩蓋成本。

**Tech Stack:** 基準 package.json 為 Next.js 16、React 19、strict TypeScript、next-intl、Tailwind/shadcn、Drizzle/PostgreSQL、Neon Auth、Stripe、Vitest、Playwright。版本與 API 以執行 checkout 的 lockfile、本機套件文件及 AGENTS.md 為準；本計劃不要求升級依賴。

**Spec:** 隨包 `evidence/HKWTIA_Member_Portal_Continuation_Evidence_2026-10-14.zip`。先讀其中 continuation 報告、Fix Plan、UAT、findings、E07–E10，再讀內嵌 10 月 13 日原包的 E01–E06。工程約束另見 repo `AGENTS.md`、`CLAUDE.md`（如適用）及相關 `docs/agent-history.md` 段落。

**日期／時區:** 2026-10-14，Asia/Hong_Kong。**性質:** 可執行計劃，尚未實作或部署。實作者將本文件放入 `docs/superpowers/plans/2026-10-14-member-portal-remediation.md`。

## 1. 基準、證據及執行原則

| 項目 | 已知基準 |
| --- | --- |
| Repository | [YNWAforever/hkwtia](https://github.com/YNWAforever/hkwtia) |
| Live／Admin | [網站](https://hkwtia.vercel.app/)／[職員後台](https://hkwtia.vercel.app/zh/admin) |
| 稽核及本次重查 main | `e8254bab79cff5945da4abe995a7c075d0ce3d57` |
| 稽核記錄 deployment | `dpl_CZQMJB8LRDBpYdgGX1zWwsdZfhpo`，metadata 同 SHA；本次寫計劃沒有重新跑部署或登入驗收 |
| 輸入 ZIP SHA-256 | `3f1061e5afe2f99ad3b41acfac1fe82b72e828ac6959f4fa7010ec73caaecfcf` |
| 發現／任務 | 12 findings：4 P1、8 P2；15 tasks，保留 T-MP00–11、T-MP12A、T-MP12B、T-MP13 |
| UAT 基準 | 60 項：7 pass、2 fail、45 blocked、6 not-tested；42 項操作抽樣 |
| 隔離證據 | R14-01–10 是原 TS 函式加明示合成依賴；沒有實際 DB、Stripe 或完整 Next 頁面 |

7 個 pass 中只有 UC-MP60 是 10 月 14 日新增公開 UI 實測。兩個 fail 是多會籍摘要重現與 10 月 12 日 CI Lighthouse 結果。重現腳本 exit 0 表示它核對了**當前行為，包括缺陷**；修復後不應把腳本原封不動當作成功標準。原包保持不變，修復回歸測試應斷言期望行為。

執行時先 `git fetch origin`、讀最新 `AGENTS.md` 及適用子目錄指引、記錄 `git status --short`、HEAD 與 `origin/main`。如 main 已變，逐 finding 做差異覆核；已修項目用同版測試確認，不重做、不回退別人的工作。必要時使用隔離 worktree，保留現有未提交變更。

### Global Constraints

- 每個 exported `"use server"` action 自行解析登入 actor。actor-taking helper 留在 server-only module；不能由 browser 提交 actor、profileId 或角色作授權。
- 使用 `actor.profileId` 存取本人資料；companyId、orderId、eventId 即使來自 hidden field，也須重新驗權。未知 ID 與無權 ID 不洩露他人資料。
- 保留 `membershipGrantValiditySql`、撤席判斷、DB role recheck、兩層名錄同意、`LAST_OWNER_PROTECTION`、價格／庫存鎖、付款冪等與 webhook 驗證。
- `past_due`、`cancel_at_period_end` 目前仍有權益；本次不改變政策。已有訂閱的 pending_payment 走既有支援／復原邏輯，不建立第二份訂閱。
- Runtime DB import 用 `lib/db/server-schema.ts`；`schema-core.ts` 僅供 build-time schema。新 migration 要與當前序號銜接，不能預設或覆寫編號。
- 所有可見文案同步寫入 `messages/en.json`、`messages/zh-HK.json`；中文路徑使用 `localizedPath` 的 `/zh`，不要把 `/zh-HK` 當成公開路徑。
- 保留 Portal 現有品牌、分組導航、單一 main landmark、skip link、noindex、keyboard focus、`prefetch={false}` 私有連結及職員導向後台的規則。
- 10 月 8 日兩份 Portal design spec 是舊展示批次的範圍限制；沿用其視覺與可用性成果。本修復計劃另外明列需要更改的 query/action 契約，不把舊展示限制誤讀成可忽略資料缺陷，也不重建整個 shell。
- 不以刪 guard、降低 Lighthouse 0.90 門檻、增加 skip、修改 assertion 配合錯誤結果、靜態 HTML 或 mock provider 作完整驗收。
- 只在已確認隔離 DB、測試身份及測試 provider 中作變更驗收；既有安全登入流程處理使用者登入。不要求使用者在對話貼密碼、token 或 magic link。
- 本計劃的交付終點是已測試分支／可審閱 PR 與證據。正式資料寫入、通知、收退款、secret 輪換、merge 或 production deployment 依當次明確授權執行；未獲授權時先完成可審閱成果。

### Review Focus

1. **多份會籍同狀態、缺期限或資料排序改變**：摘要仍來自同一 ID，欠款不消失；T-MP01 的 permutation／tie／null 測試。
2. **開表單後切公司、被撤權或提交舊 companyId**：不得默默寫另一家公司；T-MP06、T-MP07、T-MP05 的 stale-context／role-revocation 測試。
3. **付款成功但 webhook 遲到、返回前會籍失效或重複回呼**：只能顯示 DB 可證實狀態，已購歷史與新購資格分開；T-MP03、T-MP04 的延遲／重播／ownership 測試。
4. **名錄同名、中英文排序、公司同意撤回或 cursor 跨搜尋重用**：不漏／重複合法項目，不回傳已撤權項目；T-MP09 的 SQL 分頁及同意測試。
5. **通知超時而送達結果不明，或工具不支援撤權協議**：不得盲目重送或宣稱外部整合完成；T-MP05 的 uncertain-result 測試及 T-MP12A/B 的協議分支。

## 2. 批次及依賴

每批產生可獨立審閱的 commit／PR。以下是單一執行者的建議順序；T-MP00 的外部環境準備可等待，但不能阻止其他任務的純程式修復。

| 批次 | 順序 | 交付與通過條件 |
| --- | --- | --- |
| A 基準 | T-MP00；啟動 T-MP12A | 版本／角色／環境清單與工具協議問題；受阻項目具體化 |
| B 核心資料與復原 | T-MP01 → T-MP02 → T-MP06 → T-MP07 | 摘要一致、失效本人資料可用、公司讀寫一致、表單有回饋 |
| C 活動與購票 | T-MP03 → T-MP04 | 會員限定購買、正確返回、本人訂單與報名可持續查閱 |
| D 日常維護 | T-MP05、T-MP08、T-MP10 | 席位批量、文件來源／範圍決策、清楚的自助內容 |
| E 效能及工具 | T-MP09、T-MP11；T-MP12A → T-MP12B | SQL 有界讀取、公開效能門檻、經驗證的工具授權 |
| F 整體驗收 | T-MP13 | 同版 member → staff → member 閉環、UAT 與發布證據 |

| Task | Finding | 必要依賴 | 初始狀態 |
| --- | --- | --- | --- |
| T-MP00 | validation-gap | 無 | 受阻：真實角色及隔離環境尚未核實 |
| T-MP01 | F-MP01 | 無 | 待開始 |
| T-MP02 | F-MP02 | 無 | 待開始 |
| T-MP06 | F-MP06 | T-MP01 | 待開始 |
| T-MP07 | F-MP07 | T-MP02、T-MP06 | 待開始 |
| T-MP03 | F-MP03 | T-MP02 | 待開始 |
| T-MP04 | F-MP04 | T-MP02、T-MP03 | 待開始 |
| T-MP05 | F-MP05 | T-MP06 | 待開始 |
| T-MP08 | F-MP08 | T-MP02；資源範圍決策 | 待開始 |
| T-MP09 | F-MP09 | 無；涉及 context 時整合 T-MP01/06 | 待開始 |
| T-MP10 | F-MP10 | T-MP02；會籍政策內容確認 | 待開始 |
| T-MP11 | F-MP11 | 無；對最終合併版本重測 | 待開始 |
| T-MP12A | F-MP12 | 無 | 待開始：先調查 |
| T-MP12B | F-MP12 | T-MP12A | 待開始：按協議結果實作 |
| T-MP13 | validation-gap | T-MP00–11、T-MP12B | 受阻：完整環境驗收尚未完成 |

不得把 T-MP12A 的調查與 T-MP12B 的條件實作合併成「直接換 SSO」。T-MP08、10、12 的外部決策未完成時，完成可做的契約、測試及草稿，繼續其他任務。

## 3. 檔案責任與共用契約

下列「新增」路徑是本計劃的建議，不代表基準已存在。執行時如有同責任實作，擴充它並記錄對應，不平行建立第二套。各任務都要同步必要的 message keys、型別 fixture 及 caller；不要因新增欄位就把合法測試資料 cast 成 `any`。

| 邊界 | 主要既有檔案 | 建議新增單位 |
| --- | --- | --- |
| 會籍摘要 | `lib/portal/queries.ts`、`next-step.ts`、Portal首頁 | `lib/portal/membership-selection.ts` |
| 本人資料與頁面狀態 | `lib/portal/command-core.ts`、`commands.ts`、`content.ts`、`page-actor.ts` | `lib/portal/self-profile.ts`、`access-state.ts` |
| 公司上下文 | `company-profile-core.ts`、`company-profile-actions.ts`、`lib/showcase/member-core.ts` | `lib/portal/company-context.ts`、`components/portal/company-selector.tsx` |
| 表單結果 | `components/portal` 既有表單及兩個 action 檔案 | `lib/portal/form-state.ts` |
| 會員購票／本人訂單 | `lib/tickets/checkout-core.ts`、`checkout-actions.ts`、`lib/db/repos/event-orders.ts` | `lib/tickets/return-paths.ts`、`lib/portal/my-orders.ts` |
| 我的活動 | `lib/events/member-core.ts`、`lib/admin/member-360.ts`（僅參考資料關係） | `lib/portal/my-events.ts`、`lib/db/repos/portal-registrations.ts` |
| 席位批量 | `lib/portal/seats.ts`、`lib/db/repos/seats.ts`、`components/portal/seat-table.tsx` | `lib/portal/seat-bulk-core.ts`；沿用可適用的 batch 基礎 |
| 文件資源 | `lib/portal/content.ts`、documents頁；billing來源保持獨立 | `lib/db/repos/member-resources.ts`（僅資源方案獲確認後） |
| 查詢效能 | `lib/db/repos/portal-content.ts`、`events.ts`、`lib/portal/directory-paging.ts`、layout | 優先修改原 repository；需要索引才加 migration |
| 工具身份 | `lib/portal/member-tools.ts`、`config/member-tools.ts`、tools/[key]頁 | `docs/security/member-tool-contract.md`；adapter 依協議決定 |

新增介面的共同規則：讀取接受 server 取得的 `Actor`；所有 export action 的公開參數只含使用者可輸入欄位。錯誤用封閉 code 映射 message key；不回傳原始 exception、SQL、provider response 或 secret。以下簽名是**擬定介面**，其相依 model types 使用 repo 現有型別。

```ts
// T-MP01；DashboardMembership 使用 queries.ts 現有型別
choosePrimaryMembership(rows: readonly DashboardMembership[]): DashboardMembership | null
// DashboardViewModel 新增 primaryMembershipId、primaryMembership；兩者與 primaryStatus 一致

// T-MP06；requestedId 不合法時拒絕，不回退另一家公司
resolveCompanySelection(
  companies: readonly DashboardCompany[],
  requestedId: string | null,
  capability: "view" | "manage",
): {status: "selected"; company: DashboardCompany}
 | {status: "none" | "forbidden"}

// T-MP03；AppLocale、TicketEvent 已存在
ticketReturnPaths(
  event: Pick<TicketEvent, "id" | "slug" | "visibility">,
  locale: AppLocale,
  orderId: string,
): {successPath: string; cancelPath: string}
```

## 4. 逐項實作

### T-MP00 — 建立可用而且隔離的驗收基準

**依據／案例：** validation-gap；UC-MP04、05、20、43；E01、E06、E07。負責：工程＋QA＋專案擁有人。原估 0.5–1 日，等候身份／環境時間另計。

**讀取：** `tests/fixtures/m2-auth.ts`、`m2-runtime-env.ts`、`audit-isolated-db.ts`、`tests/integration/audit-database-fixture.ts`、`playwright.config.ts`、`vitest.config.ts`、AGENTS 的 DB/Stripe 章節。

**產出介面：** 在 `docs/qa/member-portal-remediation-environment.md` 記錄 repoSHA、deployment、fixtureRunId、角色與可執行 suites；只記環境變數名稱及核實狀態。必要時新增 `tests/fixtures/portal-remediation-fixture.ts`，重用既有隔離 guard，提供固定的多會籍、雙公司、七狀態及票券 fixtures。

- [ ] 核對工作樹、輸入 ZIP checksum、lockfile、最新 main 與目前測試基準；用 repo 的 npm lockfile 安裝，不臨時升級套件。讀安裝版本 `node_modules/next/dist/docs/` 的相關指引。
- [ ] 建立一般 member、company owner/admin/member、失效 member、獨立 staff 的角色資料；確認 auth user ID 與 `profiles.id` 關係。不要把正式 staff 降權來假扮會員。
- [ ] 以真實測試 session 確認角色；`signInForM2` 是測試身份登入方式，不是正式 Google／magic-link 完整流程的證明。後兩者仍須各自驗收。
- [ ] 核實 DB guard：`AUDIT_ISOLATED_ACCEPTANCE=1`、`DATABASE_URL===DATABASE_URL_TEST`、兩個 project ID 符合既有 guard、hostname 與 `M2_TEST_NEON_HOST` 相符，並由環境擁有人確認真的隔離。不能只設定旗標便宣稱安全。M6 的 seed 另有專屬 allowlist，本計劃不要求盲目執行 M6。
- [ ] 按 repo 流程在隔離 DB 執行 migrate，再 seed；Stripe 使用 AGENTS 指定 `STRIPE_TEST_*`，通知使用測試收件／provider。測試開始與清理後都讀回 fixtures；cleanup 失敗要使驗收失敗。
- [ ] 記錄每個 suite 的 executed／passed／failed／skipped；缺環境只阻擋該種驗收，繼續 T-MP01 等可實作部分。提交環境清單與 fixture 變更，不提交 session、密碼或 connection string。

**驗收：** 已驗身份、應用與 DB 指向同一隔離環境，必要整合 suite 實際執行且不 skip。**回退：** 清理該 fixtureRunId 的測試資料／session；不變更正式資料。

### T-MP01 — 會籍摘要來自同一筆記錄，欠款獨立可見

**依據／案例：** F-MP01／P1；R14-01；UC-MP09、33。原估 1–2 日。依賴：無。

**修改：** `lib/portal/queries.ts`、`lib/portal/next-step.ts`、`app/[locale]/(member)/portal/page.tsx`、`components/portal/dashboard/membership-glance.tsx`、`next-step.tsx`。**新增：** `lib/portal/membership-selection.ts`、`tests/unit/portal-membership-selection.test.ts`。擴充既有 `portal-next-step.test.ts`、`portal-dashboard-page.test.tsx`、`portal-dashboard-components.test.tsx`。

**介面：** `choosePrimaryMembership` 沿用現有順位 active > past_due > cancel_at_period_end > pending_review > pending_payment；同順位以 membership ID 升序穩定選擇。空集合回 null，由原復原流程處理。VM 的 `primaryMembershipId`、`primaryMembership`、`primaryStatus` 同源；公司由該筆 companyId 關聯。`next-step` 另外檢查全部會籍的付款／待審事項，CTA 進既有 billing 復原，不直接重新開 checkout。

- [ ] 加入行為測試：反轉／任意排列相同 rows，`expect(selected.id).toBe(activeId)`；兩個 active 同順位仍穩定；方案、席位、公司、日期均屬同一 ID；期限 null 不猜日期；active＋past_due 仍出現欠款提示。
- [ ] 執行 `npm test -- tests/unit/portal-membership-selection.test.ts tests/unit/portal-next-step.test.ts tests/unit/portal-dashboard-page.test.tsx`，先看到針對舊選擇行為的失敗。
- [ ] 在 query 產生單一 primary 物件；移除顯示層的 `memberships[0]` 混用。保留一個最急 next step，另顯示其餘需處理會籍及公司名稱；缺值省略，不用另一筆資料補上。
- [ ] 重跑同組測試及 dashboard component 測試；重新引入舊陣列選擇一次確認回歸測試會失敗，再復原正確實作。核對單會籍顯示不變。
- [ ] 提交 `fix: align portal membership summary and recovery actions`，記錄純函式與 UI 驗收分層；尚未登入驗收列待驗收。

**回退：** 可回退呈現方式；不回退到混用 ID 的資料契約，不修改付款狀態。

### T-MP02 — 將本人資料、權益及復原狀態分開

**依據／案例：** F-MP02／P1；R14-02、10；UC-MP10、11、20、32、54、55。原估 2–3 日。依賴：無。

**修改：** Portal layout、profile/billing/events/directory/documents/tools 等既有頁，`lib/portal/command-core.ts`、`content.ts`、`page-actor.ts`。**新增：** `lib/portal/self-profile.ts`、`lib/portal/access-state.ts`、`tests/unit/portal-access-state.test.ts`、`tests/e2e/portal-access-state.spec.ts`。

**介面：** `getSelfProfile(actor: Actor)` 只回傳本人可編輯資料，與 paid-benefit query 分開。`PortalAccessState` 使用 ready／needs_payment／under_review／inactive／no_company 的封閉結果；以目前授權／會籍函式判斷，不另造一套寬鬆權限。資料庫不可用等 unexpected error 仍走可追蹤的失敗處理，不偽裝成沒有會籍。

- [ ] 在 `portal-authorization.test.ts`、`portal-content-runtime-authorization.test.ts` 及新 access-state 測試加入七狀態：權益不符時 benefit adapter 呼叫為 0；expired/cancelled 可讀／寫自己的白名單偏好，不能讀別人的 profile 或公司私有資料。
- [ ] 執行 `npm test -- tests/unit/portal-access-state.test.ts tests/unit/portal-authorization.test.ts tests/unit/portal-content-runtime-authorization.test.ts`，確認失敗指向目前 profile／頁面復原缺口。
- [ ] 本人 profile 的讀寫移出 recoverable-membership gate，保留 requireMember、actor.profileId、欄位驗證與 consent 寫入保護；公司及權益的 gate 保持。重用 billing 的本人歷史／support 復原，不刪 `MEMBERSHIP_INACTIVE`。
- [ ] 導航與目的頁同步顯示清楚原因及下一步；待付款到 billing、待審說明、失效提供會籍選項與本人帳單。公司管理、活動建立／編輯、邀請接受仍依原角色／token 規則，不能用一個「會員有效」布林概括所有路由。
- [ ] 以 `npm run test:e2e -- tests/e2e/portal-access-state.spec.ts tests/e2e/portal-membership-recovery.spec.ts` 跑真實頁面；七狀態×兩語言×實際 route manifest，保存每格結果。提交 `fix: separate member self-service from benefit access`。

**驗收：** 預期狀態不落一般重試頁；本人偏好與帳單可用；受限制讀取仍沒有執行。**回退：** 可回退新呈現，但不以開放私人查詢作回退。

### T-MP06 — 明確公司選擇貫穿讀取及提交

**依據／案例：** F-MP06／P2；R14-03、04；UC-MP14–16、51–53。原估 1–3 日。依賴：T-MP01。

**修改：** company、listing、seats 三頁；`lib/portal/company-profile-core.ts`、`company-profile-actions.ts`、`command-core.ts`；`lib/showcase/member-core.ts`、`member-actions.ts` 及相應表單。**新增：** `lib/portal/company-context.ts`、`components/portal/company-selector.tsx`、`tests/unit/portal-company-context.test.ts`。

**介面：** GET 的缺省選擇可按穩定 ID 排序選第一個符合 capability 的公司；一旦存在 requestedId 就必須驗該 ID。POST 必須帶明確 companyId，缺少或無權均拒絕，不 fallback。`saveCompanyProfile(actor, {companyId, profile}, deps)`、`submitCompanyProfile(actor, companyId, deps)` 使用同一 ID，repository 仍即時重驗 owner/admin。

- [ ] 測試 A 為一般 member、B 為 owner；A/B 都 owner；表單載入 A 後回讀排列 B/A；非法 B ID；開表單後撤權。斷言 `savedCompanyId===submittedCompanyId`，無權／缺 ID 時寫入 0。
- [ ] 執行 `npm test -- tests/unit/portal-company-context.test.ts tests/unit/company-profile-core.test.ts tests/unit/company-portal-role-race.test.ts`，觀察原 first-manageable 行為的失敗。
- [ ] 重用 events/new 的公司選擇互動，統一頁首、選單、基本資料、公開 profile、listing 及席位目標。讀取型別與 action parser 一起改；保留公開 profile 審批／降回待審規則。
- [ ] 切換有未儲存內容時提供確認；target 被撤權時清楚拒絕並重新選擇，不自動把舊內容轉投另一家公司。若加入內容 optimistic version，使用明確內容版本，不能混用職員 `review_version`。
- [ ] 跑 `npm test -- tests/integration/company-profile-role-revocation-postgres.test.ts tests/integration/showcase-manager-revocation-postgres.test.ts` 及隔離 UI case；確認非 skip。提交 `fix: bind portal company forms to explicit company ids`。

**回退：** 可隱藏多公司選擇 UI，保留明確 companyId 與 repository 授權契約；不要恢復隱式錯公司寫入。

### T-MP07 — 表單成功、錯誤及進行中狀態可理解

**依據／案例：** F-MP07／P2；UC-MP12–14、42、55。原估 1–2 日。依賴：T-MP02、06。

**修改：** profile/company 表單與 `lib/portal/commands.ts`；重用公開 company profile 的 action-state 模式。**新增：** `lib/portal/form-state.ts`。擴充 `tests/unit/portal-profile-form.test.tsx`、`portal-company-forms.test.tsx`、`portal-profile-whatsapp.test.ts`。

**介面：** `PortalFormState` 區分 idle、success、validation_error（fieldErrors）、forbidden、conflict、unavailable；只含可安全回傳的欄位。`updateProfileAction(previousState, formData)`、`updateCompanyAction(previousState, formData)` 回該型別，各自 resolve actor。禁止把 redirect／framework control flow 一併吞成 generic failure。

- [ ] 用真實 Zod schema 測 WhatsApp 同意但沒有號碼、無效號碼、合法儲存、重複點擊、server failure；不是沿用 E08 的 schema stub。驗證錯誤保留輸入、成功只在 write 完成後顯示。
- [ ] 執行 `npm test -- tests/unit/portal-profile-form.test.tsx tests/unit/portal-company-forms.test.tsx tests/unit/portal-profile-whatsapp.test.ts`，先看到舊 void action 缺回饋的失敗。
- [ ] 加入 pending 禁重按、欄位訊息、首個錯誤焦點、aria-live 成功通知；預期錯誤映射 localized code。保留所有原有效 field names，以及 company `directoryVisibleShown` 防止缺省欄位把同意清空的保護。
- [ ] 儲存後正確 revalidate 當前語言頁及摘要，重新讀 DB 確認資料與兩份 consent 記錄；不能只看 toast。中英、390px／1440px、鍵盤及 refresh 驗證。
- [ ] 提交 `fix: provide actionable portal form feedback`；合法已保存資料不隨 UI 回退而還原。

### T-MP03 — 接通會員限定購票及正確返回

**依據／案例：** F-MP03／P1；R14-05、06、E09；UC-MP27–29、48–50。原估 2–4 日。依賴：T-MP02。

**修改：** `lib/tickets/checkout-core.ts`、`checkout-actions.ts`、`lib/db/repos/event-orders.ts`、Portal events list。**新增：** `lib/tickets/return-paths.ts`、`lib/portal/my-orders.ts`、`app/[locale]/(member)/portal/events/[id]/page.tsx`、`app/[locale]/(member)/portal/orders/[orderId]/page.tsx`、`tests/unit/ticket-return-paths.test.ts`、`tests/integration/portal-order-ownership.test.ts`、`tests/e2e/member-private-ticket-purchase.spec.ts`。

**介面／路由：** public 活動保留原 `/events/[slug]?ticket=received`／`?ticket=cancelled` 返回及既有 guest recovery。members_only 的購票入口為受保護 `/portal/events/[id]`，success/cancel 分別返回本人 `/portal/orders/[orderId]?ticket=received`／`?ticket=cancelled`，由 `localizedPath` 產生兩語言路徑。orderId 來自已建立訂單，非 browser 提供；`my-orders` 只用 actor.profileId 取本人訂單的最小投影。

- [ ] 先擴充既有 `ticket-checkout-core.test.ts`，檢查 actual create-session 的 success/cancel 參數；再以 `ticket-return-paths.test.ts` 固定新 helper 契約：members_only/en 的 successPath=`/portal/orders/order-1?ticket=received`、cancelPath=`/portal/orders/order-1?ticket=cancelled`，zh-HK 兩者加 `/zh`；public 保留現有路徑。任意外部 return URL 不被接受，invite_only 仍由既有 eligibility 拒絕。
- [ ] 執行 `npm test -- tests/unit/ticket-return-paths.test.ts tests/unit/ticket-checkout-core.test.ts tests/unit/ticket-checkout-actions.test.ts`，確認舊 members_only 公開返回行為造成失敗。
- [ ] 私有活動 reader 在讀取前驗 session／會籍／published／audience；不要更改公開 reader 的 visibility=public 限制。`APP_URL` 的 origin 驗證仍必須在建立 order 前完成；只改合法返回目的地，不重寫定價、庫存與 session recovery。
- [ ] 返回頁以本人 order 與已處理 webhook 的 DB 狀態呈現 processing／已付／取消等結果；`ticket=received` 不是付款證據。webhook 未到可刷新；取消用原復原流程。已合法購買而後來停會者可看最小本人歷史，不因此重新取得所有私有活動權益。
- [ ] 跑既有 `ticket-eligibility-postgres.test.ts`、`ticket-checkout-recovery-postgres.test.ts` 及新 ownership integration；驗跨訂單、mid-checkout 撤席、同一 idempotencyKey、重播 webhook、庫存競爭。DB gate 必須在新 session 可付款前生效；付款後資格改變沿用履約／人工處理政策，不自行新增退款規則。
- [ ] 用 Stripe test 真正完成中英成功／取消／延遲返回，讀回 order、ticket、webhook。再驗公開 guest 流程沒有回歸。提交 `fix: complete protected member ticket checkout journeys`。

**回退：** 關閉新購買入口仍保留已產生訂單的返回／歷史及 webhook 相容；不刪付款記錄。

### T-MP04 — 我的報名與門票可刷新、可跨裝置查閱

**依據／案例：** F-MP04／P2；UC-MP24–26、30、49。原估 2–4 日。依賴：T-MP02、03。

**新增：** `lib/portal/my-events.ts`、`lib/db/repos/portal-registrations.ts`、`app/[locale]/(member)/portal/events/my/page.tsx`、`tests/unit/portal-my-events.test.ts`、`tests/integration/portal-registrations-scope.test.ts`。**修改：** events list、`components/portal/event-registration-form.tsx`、Portal navigation；擴充活動 E2E。

**介面：** `getMyRegistrations(actor, {cursor, limit})` 回 `items + nextCursor`；每項有 eventId、資料來源 rsvp／ticket、本人狀態、時間及已授權 action link。付款資料重用 T-MP03 的本人投影；購買者與參加者的可見範圍分開，不直接回傳 Member360 payload。參加者連結須有既有已驗身份／票券授權依據，不能只憑任意輸入電郵認領別人的門票或付款資料。

- [ ] 加入「refresh 後仍已報名／候補」「無付款證據不顯示有效票」「別人 order 不可見」「購買者／參加者不同」測試；DB state 是來源，不能用初始為空的 action state 判斷尚未報名。
- [ ] 執行 `npm test -- tests/unit/portal-my-events.test.ts tests/unit/portal-events-registration-mode.test.tsx`，確認當前缺本人列表的測試失敗；再實作分頁讀取與已報名投影。
- [ ] 將「可參加活動」「我的報名／門票」「公司主辦」分清；提供既有安全票券復原與支援入口，完整映射現有取消／退款／候補狀態。不要自動新增退款或任意轉讓功能。
- [ ] 執行 `npm test -- tests/integration/portal-registrations-scope.test.ts`；在真實測試 session 跑 RSVP→refresh→跨裝置→門票復原，重用 T-MP03 E2E。現有重複 RSVP 防護仍通過。
- [ ] 提交 `feat: add scoped member registrations and ticket history`。回退列表時保留原電郵票券入口、本人 order 及所有資料。

### T-MP05 — 可辨識、可批量、可恢復的公司席位維護

**依據／案例：** F-MP05／P2；UC-MP17–19、44、53。原估 3–5 日。依賴：T-MP06。

**修改：** `components/portal/seat-table.tsx`、seats頁、`lib/portal/seats.ts`、`lib/db/repos/portal-content.ts`、`seats.ts`；檢查既有 batch runner 可重用的部分。**新增：** `lib/portal/seat-bulk-core.ts`、`tests/unit/portal-seat-bulk.test.ts`、`tests/integration/portal-seat-bulk-concurrency.test.ts`、`tests/e2e/portal-seat-bulk.spec.ts`。

**介面：** `previewSeatInvites(actor, {companyId, rows})` 回 server snapshot、容量與逐項問題；`commitSeatInvites(actor, {companyId, snapshotId, requestId})` 回 batchId；讀取結果只允許該公司當前管理員。預覽不是授權，commit／worker 每筆重新驗角色及容量。不得把 staff batch API 改成所有 member 可用。

- [ ] 測試 5／25 席 fixture、現有及待接受邀請計入容量、輸入重複、部分失敗、重試、角色撤銷與最後 owner。顯示姓名及必要電郵識別，內部 userId 移到進階詳情。
- [ ] 執行 `npm test -- tests/unit/portal-seat-bulk.test.ts tests/unit/seat-service.test.ts tests/unit/seat-invitation-errors.test.ts`，先證明缺少預覽／結果的失敗，再接既有席位核心。
- [ ] 先完成單筆 pending／成功／具體錯誤與撤席確認；再提供貼上或 CSV 預覽，標明筆數、角色、重複、容量與選取範圍。批量預設一般 member；任何擴權要逐項清楚確認並沿用既有允許角色。
- [ ] 以 server snapshot 與穩定 per-item operation key 實作提交；DB 交易內核對容量，通知沿用 consent／locale／dedupe／outbox。provider 結果不明先 reconciliation，不用新 key 盲目重發；只重試可重試失敗項。
- [ ] 跑 `npm test -- tests/integration/portal-seat-bulk-concurrency.test.ts tests/integration/seat-capacity.test.ts` 與新 E2E；逐筆讀 DB／outbox 核對，使用合成地址及測試 provider。提交 `feat: add recoverable company seat batch management`。

**回退：** 關閉 bulk 入口、保留單筆與 batch audit；未執行項可取消，已送通知不能假稱撤回。

### T-MP08 — 文件資源有來源，帳單權限獨立

**依據／案例：** F-MP08／P2；R14-08；UC-MP31、32、59。原估 0.5 日定義＋2–4 日實作。依賴：T-MP02。

**修改：** `lib/portal/content.ts`、documents頁、`tests/unit/portal-documents.test.tsx`。**有條件新增：** `lib/db/repos/member-resources.ts`、`app/api/portal/resources/[id]/route.ts`、`tests/integration/portal-resource-access.test.ts`；新增表／索引使用下一個正常 migration。

**介面與決策：** 先提交兩個具體可審閱方案：A 接既有內容管理及私人儲存的會員資源庫；B 本期只提供本人帳單、清楚說明資源尚未提供。由產品範圍決定，不因 adapter 回 [] 就虛構正式文件，也不以隱藏承諾冒稱完整資源功能已驗收。

- [ ] 確認現有 CMS／media 是否具備 private 下載、發布、撤回及版本能力；記錄可重用介面及缺口。本人 Stripe 收據仍走既有 billing 授權，不能用 benefit gate 一起封鎖。
- [ ] 若採 A，先寫 draft 不可見、published 可見、withdrawn／expired 不可下載、失效會員拒絕資源、他人帳單拒絕等測試；`npm test -- tests/unit/portal-documents.test.tsx tests/integration/portal-resource-access.test.ts`。
- [ ] `listApproved(actor)` 查實際發布資料；download route 每次驗會籍、資源發布／有效期及權限，回 private/no-store。用受保護 proxy 或等效可撤權方式；永久公開 media URL 不可充當私人資源。已下載的副本不能保證撤回。
- [ ] 職員完成 draft→publish→withdraw 後回到會員端讀取並測舊下載 URL；記錄資料與審計。若採 B，只實作誠實範圍及帳單 UX，保存產品決策，UC-MP59 保留未執行／範圍調整原因，不改成假 pass。
- [ ] 提交 `fix: define and enforce portal document access`。回退新資源入口時保留帳單、歷史文件及審計。

### T-MP09 — 把篩選、權限及分頁放到 SQL

**依據／案例：** F-MP09／P2；R14-07；UC-MP21–23、41、56。原估 2–4 日。原依賴：無；涉及共用 context 時整合 T-MP01/06。

**修改：** `lib/db/repos/portal-content.ts`、`events.ts`、`lib/portal/content.ts`、`directory-paging.ts`、`queries.ts`、`lib/events/member-core.ts`、Portal layout。**新增：** `tests/integration/portal-directory-pagination.test.ts`、`portal-member-event-pagination.test.ts`；需索引才建立 migration。

**介面：** repository 接收正規化 filters、validated cursor、limit，回 `items + nextCursor`；沿用 default=20、max=50。名錄 tuple 為排序名稱、userId、companyId，尊重同一人有多公司時既有投影語意，不隨便只按 userId 去重。event pagination 同樣在 SQL 先做可見性／時間／權限，再 limit。

- [ ] 固定 100／1,000／10,000 隔離資料、20 筆頁大小；斷言一次 repository 回傳不超過 limit+1、頁面不超過 limit、排序／cursor 無重複或跳漏。另測中文、重音、同名、null公司、損壞 cursor、搜尋條件改變。
- [ ] 執行 `npm test -- tests/unit/directory-paging.test.ts tests/unit/portal-content-scope.test.ts tests/integration/portal-directory-pagination.test.ts tests/integration/portal-member-event-pagination.test.ts`。先看到全量讀取／SQL分頁契約的失敗，不能只 spy JS slice。
- [ ] SQL 保留 profile＋company 兩層 consent、現時席位、benefit status、grant validity；同意撤回／撤席後下一頁不再回傳。資料讀取失敗不可回空陣列假成功。
- [ ] SQL ORDER BY 與 cursor 比較使用同一明確 collation／tuple。若舊 JS 排序 cursor 不相容，版本化 cursor 並讓舊／跨搜尋 cursor 安全重設與顯示提示；不要混用 SQL 比較與 JS localeCompare。
- [ ] 記錄 EXPLAIN、返回筆數、round trips、payload bytes、時間樣本；索引依 query plan 決定。limit+1 限制的是傳回資料，不代表 PostgreSQL 只掃描這些列。
- [ ] 同一 request 重用 actor/company context，禁止跨使用者 cache 私有結果；只傳 client 使用的翻譯 namespace，驗所有子頁文字仍齊全。提交 `perf: bound portal directory and event queries`。

**驗收：** 原隔離觀察 10k 讀兩頁供應 20k 候選是對照線索；以實際 SQL 前後量測證實改善，不報未量測的 p95。**回退：** 可回退 query 實作但保留授權／consent；索引經確認可安全保留，不盲目 drop。

### T-MP10 — 會員看得懂的會籍政策與自助入口

**依據／案例：** F-MP10／P2；UC-MP07、33、34、45。原估 1–2 日，政策回覆時間另計。依賴：T-MP02。

**修改：** `messages/en.json`、`messages/zh-HK.json`、實際 membership／join／billing 文案來源；保留 CMS approved-copy 途徑。**新增交付：** `docs/content/member-policy-copy-matrix.md`。

**介面：** 文案矩陣逐項列 policyId／版本、已批准事實、兩語言文案、出現位置、自助 link；不要杜撰自動續費、取消生效日或退款承諾。

- [ ] 核對現有 plan／billing／CMS，整理未明政策及建議文案供會員營運確認。現有 5／25 席及年度價格不是稽核缺漏，不擅自改數字。
- [ ] 可先移除「結帳價格編號」等內部實作字眼，加入 localized「管理會籍／查看帳單／聯絡支援」入口；深連結登入後目的地仍完整保留。
- [ ] 以 `npm run audit:strings` 及 `npm test -- tests/unit/portal-billing-messages.test.ts tests/unit/portal-continuation.test.ts` 核對 parity／目的地。低風險文案不額外寫只比較字串的重複測試。
- [ ] 核實五位代表使用者可找到續會、取消安排及帳單；未取得真人驗收就記待驗收。政策未批准只阻擋該內容發布，不阻擋安全連結修復。
- [ ] 提交 `fix: clarify membership self-service guidance`，保留已接受條款版本，不覆寫歷史。

### T-MP11 — 用可重複量測修效能，不降低門檻

**依據／案例：** F-MP11／P2；E02；UC-MP40、41。原估 1–3 日調查，修復量依 LHR。依賴：無；最後重測整合版本。

**讀取：** `.github/workflows/weekly-lighthouse.yml`、`lighthouserc.js`、run `38230512485` 原 LHR／trace；再定位實際資源、component 或 query。**修改：** 只改測量證實的瓶頸；不預設改首頁所有動畫／圖片。

**產出介面：** `docs/qa/member-portal-performance.md` 記 SHA、deployment、route、device/network、資料量、cold/warm、每次原值、median、失敗與誤差。沒有 RUM 時不聲稱真實 p75。

- [ ] 重新量測 10 個既有公開路由，每條至少三次同條件；Portal 的 dashboard、directory、events、billing 另建登入後基線。先核對 Lighthouse 設定的目標 URL，不直接對 production 壓測。
- [ ] 按 LHR／trace 找 LCP、TBT、CLS 的主因，選一個可查證瓶頸修復，再用同版同條件對照；例如圖片優先級、server 等待、client bundle，不能無證據全面重寫。
- [ ] 使用既有 `npm run test:lighthouse`／workflow 可選 local_lab、capture_profile 路徑；保留現有 0.90 gate 及原 pass/fail 邏輯。三次比較資料不能取代 CI 原有 gate。
- [ ] 檢查 loading、手機操作及鍵盤沒有因性能修改退步，不能關掉必要功能／動畫偏好或省掉權限讀取來提高分數。
- [ ] 提交已確認瓶頸的 `perf:` commit 與報告；根因未知時維持調查狀態。回退資源／渲染改動，保留門檻與原報告。

### T-MP12A — 先確認工具 token 的實際授權契約

**依據／案例：** F-MP12／P1 調查；R14-09；UC-MP46、57。原估 0.5–1 日，外部回覆另計。依賴：無。

**讀取：** `lib/portal/member-tools.ts`、`config/member-tools.ts`、tools/[key]頁、環境變數的名稱與用途。**新增：** `docs/security/member-tool-contract.md`。

**產出介面：** 每個 toolKey 一列：token用途、bearer與否、issuer、audience、會員／公司綁定、TTL、single-use、replay、session壽命、撤席／停會撤權、日誌處理、測試介面與負責人；結論是「需要改造」「非授權secret且有已驗保護」「仍待證據」三者之一。

- [ ] 用外部協議文件、工具擁有人確認及合成值測試核實各欄；不可讀出／輸出正式 token。R14-09 只證明 query 路徑，不是資料外洩結論。
- [ ] 列出具體可驗收的 code exchange／短效 session 能力，寫清允許 TTL、audience 與撤權時限；數值來自確認的協議，不在計劃中虛構。
- [ ] 若介面／負責人未提供，記錄這一條 blocker 及已完成的證據，繼續其他任務。禁止把 env 名稱改掉或把值移到 URL fragment 當成修復。
- [ ] 提交 `docs: establish member tool authorization contract`；這是只讀調查，無需正式 secret 輪換。

### T-MP12B — 按契約修正工具身份交換及撤權

**依據／案例：** F-MP12／P1；UC-MP47、58。原估 2–4 日，依協議調整。依賴：T-MP12A。

**修改：** member-tools、tools/[key]頁與需要的 server adapter；依 T-MP12A 才決定 endpoint、storage 及 migration。**新增測試：** `tests/unit/portal-tool-authorization.test.ts`、`tests/integration/portal-tool-exchange.test.ts`。

**介面：** `issueToolLaunch(actor, {toolKey, companyId})` 回 approved destination 與一次性 launch 結果，不回共用長效 secret；只允許 contract 中的 audience/origin。TTL、single-use consume 與撤權方式直接引用 T-MP12A 的版本化值。

- [ ] 若 token 是可重用 bearer，先加跨會員／跨公司、重播、過期、停會及撤席後既有 session 測試；執行 `npm test -- tests/unit/portal-tool-authorization.test.ts tests/integration/portal-tool-exchange.test.ts`，核對失敗再實作。
- [ ] 使用 server-to-server 交換或工具支援的等效機制；檢查一次性消耗競態、瀏覽器 URL／DOM／日誌、錯誤與 retry。只把值移到另一種 browser 欄位不符合驗收。
- [ ] 外部工具不支援必要能力時，明示受阻及替代方案，不偽造撤權測試；待具體方案可審閱後再按既有授權處理正式切換／輪換。
- [ ] 若證據確認它不是授權 secret，提交可驗理由及控制測試；不做無用 SSO 重寫。對不適用的原測試保留範圍決策，不硬改成 pass。
- [ ] 提交 `fix: enforce verified member tool access contract`。回退可暫停工具入口並提供支援；不得重用已撤銷或已外洩憑證。

### T-MP13 — 完成會員、公司管理員及職員的同版驗收

**依據／案例：** validation-gap；UC-MP01–60 及 operation inventory 全部列；原估 2–3 日，重測另計。依賴：所有前置任務及必要外部決策。

**新增：** `tests/e2e/portal-remediation-journeys.spec.ts`、`docs/qa/member-portal-remediation-results.md`。更新隨包 `HKWTIA_Member_Portal_Implementation_Tracker_2026-10-14.csv` 與 UAT 的「本次結果／證據」欄，保留原始 baseline。

- [ ] 將下節角色／路由／journey 矩陣實際對應到最新頁面、server actions 與測試資料。至少涵蓋原 14 頁，新加的活動詳情、本人訂單及我的活動頁另加入分母；不能仍宣稱只驗舊 14 頁就是全 Portal。
- [ ] 跑核心 focused suites、全 `npm test`、lint、typecheck、audit:strings、build、隔離 integration 與實際 signed-in E2E；讀完整結果及 skipped 原因，不只看 process exit code。
- [ ] member→staff→member 的閉環要由 member 最後重新讀取結果；職員在既有 Member360／batch／reconciliation 工作台處理，不為測試而建立新的 admin 功能。
- [ ] 在 390×844、1440×900 及 360px 窄屏抽樣，用兩語言驗 keyboard、labels、焦點、empty/error/loading、長公司名、批量結果。保留既有最小文字／觸控／axe gate；fixture render 只算視覺證據，不能算登入業務成功。
- [ ] 每個 P1 有同 SHA 證據後才列已驗證完成；其他缺少外部驗收的任務列待驗收／受阻。若某項外部決策採縮小範圍，獨立記錄批准內容及被排除案例，不能把測試未做改為通過。
- [ ] 產出 PR：問題與行為變更、finding/task IDs、測試命令及 counts、migration/flag/env 名稱、未完成項、回退方式。準備可審閱發布清單；正式發布依當次授權。每輪結尾更新下一個可直接繼續的任務。

## 5. 驗收矩陣與使用者流程

### 會籍與資料權限

| 狀態 | 本人 profile／consent | 本人合法帳單／訂單歷史 | 會員權益 | 頁面下一步 |
| --- | --- | --- | --- | --- |
| pending_payment | 可讀寫本人白名單 | 有本人記錄才可讀 | 拒絕 | 既有 billing recovery；已有訂閱不另建 |
| pending_review | 可讀寫本人白名單 | 有本人記錄才可讀 | 拒絕 | 等候審批說明 |
| active | 可讀寫本人白名單 | 可讀本人 | 按既有資格 | 正常操作 |
| past_due | 可讀寫本人白名單 | 可讀本人 | 保留現有政策 | 欠款處理仍可見 |
| cancel_at_period_end | 可讀寫本人白名單 | 可讀本人 | 保留現有政策 | 顯示真實結束日期 |
| expired／cancelled | 可讀寫本人白名單 | 可讀本人 | 拒絕 | 會籍選項、本人歷史、支援 |

上表不授予任何公司管理權。每次公司操作另外驗當下 owner/admin、membership／grant 規則；新購票與歷史訂單查閱也不能混為一談。無登入導向正確 locale login；staff 沿用 admin 導向；無本人記錄顯示真實 empty state。

### 原 14 頁與新增頁

| 頁面群 | 基準 routes（英文；中文加 `/zh`） | 關鍵邊界 |
| --- | --- | --- |
| 本人 | `/portal`、`/portal/profile`、`/portal/billing` | 會籍摘要與本人資料／歷史授權分開 |
| 公司 | `/portal/company`、`/portal/company/listing`、`/portal/company/seats`、`/portal/company/seats/accept` | 明確 companyId；accept 保留 token／身份規則 |
| 活動 | `/portal/events`、`/portal/events/new`、`/portal/events/[id]/edit` | 參加者、公司主辦、編輯角色分開 |
| 權益 | `/portal/directory`、`/portal/documents`、`/portal/tools`、`/portal/tools/[key]` | entitlement、同意、下載與外部 session |
| 本計劃新增 | `/portal/events/[id]`、`/portal/orders/[orderId]`、`/portal/events/my` | 私有詳情、本人訂單、本人報名投影 |

七狀態×原14頁×兩語言為 UC-MP54 的 196 個基準檢查格，不能當成 196 個已完成 UAT；動態頁要配真實合法／非法 fixture。新增 routes、API、actions 另外記錄。route discovery 測試要有最低數量及必要路由斷言，避免空集合「全綠」。

### 五條完整驗收流程

| Journey | 操作及最終核對 | 主要案例 |
| --- | --- | --- |
| J1 會籍復原 | 多會籍會員登入→看準確摘要→處理指定欠款→重讀 webhook／billing→另一份 active 資料不被誤改 | UC-MP04、05、09–11、33–35、43、54 |
| J2 公司日常維護 | owner 選公司B→儲存基本／公開資料→提交審批→staff處理→member回讀；批量邀請部分失敗後只重試失敗項 | UC-MP12–20、36–38、44、51–53 |
| J3 私有活動購票 | 有效會員開私有活動→Stripe test成功／取消→延遲webhook→刷新本人訂單→我的活動→門票復原；匿名與跨訂單拒絕 | UC-MP24–30、39、48–50 |
| J4 失效與隱私 | expired修改本人偏好／看帳單→權益拒絕→撤席／撤同意後名錄與工具失效；資源撤回的舊URL拒絕 | UC-MP21–23、31、32、46、47、55–59 |
| J5 支援閉環 | member提供不含秘密的案件／訂單參照→staff Member360調查→授權的測試batch／reconciliation→member確認最終結果 | UC-MP35–39、45 |

UI 新顯示成功必須有持久化讀回；金流及通知還要核對測試 provider／outbox。AI 如協助整理支援資料，只作草稿，不判定資格、退款、角色或付款成功。

## 6. 測試命令、證據層級與完成門檻

基準 `npm test` 是 `vitest run`，同時收集 unit 與 integration；不能把 integration 被跳過的綠色 exit 視為已驗 DB。`test:e2e` 是 Playwright，預設 chromium、1 worker，`PLAYWRIGHT_BASE_URL` 設定後不會自動啟動本機 server，務必核對正確 app／port／DB。不要為了方便把測試 URL 換成 production。

每項風險修復先跑新增行為測試，觀察針對 bug 的失敗，再改產品，跑綠。回歸紅測試先經既有公開函式或頁面重現錯誤，例如 getDashboard／createTicketCheckout；新增 helper 的細部測試不能只有 module-not-found 便算已捕捉舊缺陷。低風險文案／計劃不必製造虛假的紅測試。失敗若來自缺 import／環境／語法，不能當成 bug 已被捕捉。

```bash
# 各任務先跑其 focused tests；以下是每個可交付批次的既有 gates
npm test
npm run lint
npm run typecheck
npm run audit:strings
npm run build
# 環境已核實後，執行相關實際頁面與整合情境
npm run test:e2e -- tests/e2e/portal-remediation-journeys.spec.ts
```

執行整合／付款測試時，使用相應測試檔案的明示 opt-in 及隔離 guard；不能把任務的 command 清單整段盲目貼到有正式憑證的 shell。AGENTS 允許的 `RUN_POSTGRES_INTEGRATION=1` 只在 disposable local PostgreSQL 流程中使用，不證明 Neon Auth／Stripe 已驗。

| 層級 | 能證明 | 不能替代 |
| --- | --- | --- |
| Unit／原函式隔離 | 選擇、轉換、URL、schema、預期錯誤及 guard 呼叫次序 | 真實 SQL、登入、provider、部署 |
| Integration | 真實隔離 SQL、交易、角色競態、ownership、分頁及清理 | 真實 browser／外部 provider 全程 |
| Render／axe／視覺 fixture | 版面、labels、keyboard 元件及 accessibility | 真實登入後資料讀寫 |
| Signed-in E2E | 實際 app 的指定角色流程與 DB 讀回 | 未測 provider／正式部署或未走的另一角色 |
| Provider test＋部署回驗 | 指定測試 provider 的完整流程與同版環境結果 | production 金流授權、所有資料量或所有真實使用者 |

**任務狀態：** 待開始 → 進行中 → 待驗收 → 已驗證完成；缺外部條件可標受阻，附 owner、最低缺項及已完成部分。每個 task 的完成證據包括 commitSHA、deploy（如有）、method、環境、命令、executed/pass/fail/skip、fixture、case IDs、清理結果。原 evidence 與 baseline_result 不覆寫。

**發布門檻：** 對此次釋出的全部範圍完成所需 gates；P1 沒有未解權限、摘要或購票錯誤；外部工具疑點有可驗結論或明確且已批准的範圍處理；migration／provider／角色驗收不得以 skip 代替。若尚有受阻項，提交可審閱分支與限制，不能宣稱全部修好。

## 7. Migration、部署與回退

1. 第一批 T-MP01/02/06/07 優先以既有 schema 修正契約。只有資源／batch／索引確有需要才加 additive migration；保持新舊讀取相容，回填可重跑且有範圍。
2. 隔離 DB 上驗證從現有 schema 升級、重跑 fixture、衝突與失敗清理，再跑 build／integration。記錄新增 env **名稱**與用途，不記值。
3. 每個 PR 保留舊付款／webhook 兼容及已有 order 歷史；新功能若需要 rollout flag，沿用既有慣例並測兩個分支，不能用永久關閉作完成。
4. 取得發布所需授權後才按順序 migration→可兼容應用→啟用功能→同版回驗。正式資料變更另依已授權範圍，不能把隔離 fixture seed 指向正式 DB。
5. 回退關閉新入口／撤回應用版本，保留合法付款、通知與 audit。安全修正不回退到舊的隱式公司目標、跨人讀取或已撤銷 token；有需要以安全不可用狀態暫代。

## 8. 第一輪立即開始的工作

- [ ] 完成版本及差異核對；複製原 evidence 與 tracking baseline，記錄環境 blocker。
- [ ] 啟動 T-MP12A 的協議核實；不等外部回覆才開始其他修復。
- [ ] 實作 T-MP01 的穩定 primary membership 與欠款提示，先跑會失敗的行為測試，再提交修正。
- [ ] 接續 T-MP02、T-MP06、T-MP07；補足真實 DB／登入驗收前列待驗收，繼續可做任務。
- [ ] 按批次完成其他任務，持續更新 tracker、UAT、證據及下一步。不要停在再次產生計劃，也不要因某一整合受阻而停止整個實作。

本計劃完成的判斷是「已產生可執行的工程交接」。產品完成的判斷必須由上述同版驗收與發布範圍證據支持。

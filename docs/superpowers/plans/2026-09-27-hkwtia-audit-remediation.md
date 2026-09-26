# HKWTIA Audit Remediation — Codex GPT-6 Sol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Target executor: **Codex GPT-6 Sol**. Use native sequential execution; this plan does not require subagents.

**Goal:** 修復 HKWTIA 審核的 25 項問題，使會員入會、付款、活動報名及後台維護可靠，並提供可預覽、可追蹤、可重試的會員批量操作。

**Architecture:** 保留 Next.js App Router、現有 domain services／repositories、會員 lifecycle、Stripe webhook、durable outbox 及 staff actor 邊界。先修各流程，再共用會員查詢／選取規格建立背景批次引擎；公眾內容快取與私人會員／付款資料分開。

**Tech Stack:** 審核版本為 Next.js `^16.3.4`、React `^19.2.7`、TypeScript、Tailwind／shadcn、next-intl、Drizzle／Postgres（Neon）、Stripe、Vitest、Playwright；以執行時 lockfile 的實際版本為準，不順手升級框架。

**Spec:** `HKWTIA_Audit_2026-09-26_zh-HK.md` 及 `HKWTIA_Audit_Evidence_2026-09-26.zip`。本文件日期 2026-09-27，時區 Asia/Hong_Kong。這是實作計劃，本次沒有修改 application 或正式資料。

## Global Constraints

- 指定 repo：`https://github.com/YNWAforever/hkwtia`；指定 live：`https://hkwtia.vercel.app/`。不可在 `wisetech` 或其他專案誤作修復。
- 審核基準 SHA：`e309f9e82ee355de504c1372521f98a0ea04c2f3`。先比較最新 HEAD，再判斷每項是否仍存在；不可把附件 source 覆蓋回最新 repo。
- 使用者提到的 `HKWTIA_Audit_Evidence_2026-09-26.md` 未找到同名檔；實際報告是上述 `HKWTIA_Audit_2026-09-26_zh-HK.md`，亦在 ZIP 根目錄。這是名稱對應，沒有第二份不同審核報告。
- ZIP 是選定程式碼、9 份 DOM snapshot、3 張截圖、HTTP 樣本及離線重現，不是完整 repo。審核沒有登入後台、真實付款或 production logs；不得將 CODE／REPRO 當成 production 已發生事故。
- 讀目前 root／nested `AGENTS.md`。保留不相關改動；採 feature branch／必要時 isolated worktree，不 hard reset，不 force push。
- 所有 UI 字串進 `messages/en.json`、`messages/zh-HK.json`，保持 parity；公開中文路徑用 `localizedPath` 產生 `/zh/...`，不要手寫 `/zh-HK/...` href。
- Server Components 預設；runtime DB import 用 `lib/db/server-schema.ts`；`schema-core.ts` 只作 schema 定義。每個對外 action／route 自行從 session resolve actor，不能接受 browser 傳來的 actor／role／entitlement 布林值。
- 保留 Stripe 計價、名額鎖、hold、idempotency、webhook signature、async payment、outbox 及退款核實行為。不得為了讓測試通過關閉權限、RLS、captcha、限流或安全標頭。
- 只在隔離測試 DB 執行 fixtures／負載測試，僅用 Stripe test mode、測試收件者／sink。此計劃本身不授權 production 群發、收款、退款、資料清理或 production migration。
- 沿用現有合法會員政策；`isBenefitEligibleMembershipStatus` 目前包含 active／past_due／cancel_at_period_end，不自行收緊或放寬。價格、退款、自動續費、法定名稱、審批時限及公司席位以已核准資料為準。
- 新 API／檔案／資料表在本計劃標為「新增」，是設計提案，不聲稱已存在。Task 00 若發現等價實作則重用，記錄路徑對應，避免平行系統。
- 每個 bugfix 先寫行為測試並見到相應失敗，再修復。依 AGENTS 在交付前跑 focused tests、full unit suite、lint、typecheck、build；skipped 或未取得環境不是 PASS。
- 執行期間持續完成不受阻擋的工作；只有實際缺權限／政策資料的子項標 blocked，不因此停掉其餘修復。

## Review Focus

1. 多公司／多會籍同一人：篩選命中的會籍須與操作目標相同；不能顯示 A 公司的有效會籍，卻改 B 公司。由 T06／T12／T14 測試。
2. webhook／網絡／worker 回應遺失：重試不得產生第二個可付款 session、重複通知或第二次資料變更。由 T04／T05／T09／T13 測試。
3. preview 後名單、角色、聯絡資格改變：不得把新加入者納入舊批次；撤權、退訂及已續會者重新判定。由 T13／T16 測試。
4. 同步邊界：兩個入會請求、最後一個名額、兩個 worker claim 或兩次 grant 併發，仍只產生允許的一筆業務結果。由 T02／T07／T13／T15 測試。
5. 日期／語言／入口：香港午夜、英文／中文、magic-link 返回、鍵盤和手機操作一致，且不外洩其他會員狀態。由 T04／T10／T12／T18 測試。

---

## 0. Executor 工作方式與交付

程式碼路徑一律相對完整 repo 根目錄；audit inputs 位於交接套件根目錄。將本計劃複製到 repo 的 `docs/superpowers/plans/2026-09-27-hkwtia-audit-remediation.md` 後仍保留輸入附件的已知位置。

一次完成一個可獨立驗收的 Task；每個 Task 對應小型 conventional commit，可按 release 合成 PR。不要開一個龐大 PR 同時改付款、CMS、匯入及全文案。每個 commit 記錄 F 編號、測試及尚待的環境驗收。

在 repo 建立 `docs/audits/hkwtia-2026-09-26/`，保留：

- `baseline.md`：HEAD、audit SHA、部署對照、branch、環境及命令基準。
- `finding-status.md`：F01–F25 各列 `open / already-fixed / in-progress / code-verified / staging-verified / live-verified / blocked`，附證據與 commit；不以一個 done 遮蓋不同驗證程度。
- `decisions.md`：新常數、資料結構、政策來源及替代路徑；不得寫 secret／會員 PII。
- `verification.md`：命令、exit code、測試數／skip、截圖、環境、SHA、日期。
- `release-runbook.md`：migration、web/worker 部署順序、flags、smoke、回復及 production 未完成項目。

### 交付依賴與 Release

| Release | 任務 | 可交付結果／依賴 |
|---|---|---|
| R0 | T00 | 基準、測試環境、25 項現況對照 |
| R1 | T01–T05 | 報名不崩潰、活動可編輯、購票授權及數量正確、會費取消有出口；T03 用 T02 的 event contract |
| R2 | T06–T10 | 會員列表／詳情、入會續辦、三類簽到、取消通知、公開入口及內容；T09 可先以既有 outbox 實作，不等待批次引擎 |
| R3 | T11–T16 | 分頁及會員篩選、批次引擎、匯入、grant、通訊工作流；T13 依 T12，T14–T16 依 T13，T15 也依 T06 |
| R4 | T17–T18 | 共用限流、快取／監測及整體驗收；T17 的 DB 原子限流可提早加入 R1 |

每個 Release 完成自己的驗收便可成為獨立候選版本，不需等全部功能才 review。未授權正式 deploy 時，交付可審閱的 branch／PR、preview、migration 與 runbook；不要宣稱已上線。

### 通用測試循環 G（每個 T01–T18 使用）

- [ ] 寫該 Task 列出的 regression tests；先跑 `npm test -- <該 Task 的 unit 路徑>`，確認失敗是預期行為，非 import／配置錯誤。
- [ ] 實作最小範圍；用既有服務、型別及 UI 元件，保留目前 callers 的相容性。
- [ ] 重跑 focused tests；涉及 DB 不變量者跑隔離 Postgres integration，涉及使用流程者跑對應 Playwright。
- [ ] review diff、i18n parity／actor boundary／資料保護；更新 finding-status 及 verification，再 commit。

下文 `*.test.ts(x)` 和 `tests/e2e/*.spec.ts` 為建議新增測試名稱；如果目前 Playwright testDir 不同，T00 先建立明確 path map，後續使用一致路徑，不建立不被 runner 收集的測試。

## T00 — 對照最新版本與可重現基準

**輸入／輸出：** 使用完整 repo 與兩份 audit inputs；產生 baseline／finding-status／path map，不修改 application。

- [ ] 讀附件報告全文、ZIP README／manifest／offline-results／reproducer；驗證 SHA256 manifest。不要執行 ZIP 中的 seed／migration。
- [ ] 以當前 branch 狀態記錄 `git status --short`、`git rev-parse HEAD`、remote；取得授權可讀的最新 repo。對照 audit SHA 的 diff，逐項用 function／route 找到實際 caller。
- [ ] 讀 AGENTS；可用時依 repo 規則先用 code graph，沒有 graph 工具時記錄限制再用 rg。讀本地 `node_modules/next/dist/docs/` 涉及的 cache、Server Actions、routing 指南，不套用舊 Next 假設。
- [ ] 讀 lockfile、package scripts、Vitest／Playwright config、migration journal、worker config、環境 schema、部署 workflows。找出 plans catalog、登入頁、public header、會員 resolver、公司身份關聯、generic jobs/outbox 的真實路徑，寫入 path map。
- [ ] 在 ZIP 解壓目錄用 Node 24 執行 `node --disable-warning=ExperimentalWarning evidence/reproduce-findings.mjs source`；輸出是歷史缺陷證據，不能直接作修復後測試，後者必須 import 最新正式模組。
- [ ] 使用 lockfile 安裝；跑 repo 原有 checks 記錄 baseline 及既有失敗。Node／npm 以目前 repo engines／CI 定義為準。
- [ ] 核對 live alias 對應 deployment／SHA，無權讀取則寫 `unverified`。CSP 差異不是舊版本的充分證明。
- [ ] 建隔離測試環境；確認 `DATABASE_URL_TEST`，查閱 migration runner 實際讀哪個變數，僅在子程序把 `DATABASE_URL` 綁定至相同測試 DB。DB host guard 不通過就不 seed。Stripe test env 與 live env 分離。

**驗收：** 25 項都有 `still-present / already-fixed / needs-runtime / not-applicable` 初判及定位；already-fixed 必须有測試或現行行為證據；缺 credentials 不偽造驗收。

## T01 — RSVP 可恢復的驗證與故障處理（F01）

**修改：** `lib/events/guest-registration-action.ts`、`lib/events/guest-registration-core.ts`、`components/marketing/guest-rsvp-form.tsx`、兩份 messages。**新增：** `lib/events/guest-registration-input.ts`（若已有純 schema 則重用）。

**介面：** 純函數 `parseGuestRsvp(formData: FormData): GuestRsvpParseResult`，結果 `ok + data` 或 `invalid + fieldErrors`；沿用既有欄位 schema／honeypot。擴充 `GuestRsvpResult` 的 recoverable unavailable 分支及 errorId；不得帶 exception／env 值回 client。

- [ ] 新增 `tests/unit/guest-rsvp-recovery.test.ts`：`expect(empty.status).toBe('invalid')`；`expect(createTransport).not.toHaveBeenCalled()`；`expect(register).not.toHaveBeenCalled()`。
- [ ] 先驗證及必要防濫用，才初始化依賴；追查實際 F01 root cause。移除會在邊界保護之外提前 throw 的初始化，但不吞掉 required-config 錯誤。
- [ ] 對 config／DB／transport 初始化故障回 recoverable 狀態，errorId 可對 logs；區分「未建立報名」與「已建立、通知待處理」，不得已建立後回 generic failed 誘使用戶重填。重用目前重試／dedupe 合約。
- [ ] Client 保留欄位、顯示 field errors、focus 第一個錯誤，pending 防重按；server 仍驗證，不只加 HTML required。
- [ ] `tests/e2e/guest-rsvp-recovery.spec.ts`：空白、錯 email／phone、依賴中斷均留在原頁；有效／重複／候補在 test DB 正確，無效資料不建立 contact／registration、零發信。

**驗收：** 不能只靠 Error Boundary 顯示較漂亮錯誤；錯誤不離開報名上下文。G 完成後 commit `fix: recover guest RSVP validation failures`。

## T02 — 購票服務端資格與原子名額（F04）

**修改：** `lib/tickets/checkout-actions.ts`、`lib/tickets/checkout-core.ts`、`lib/db/repos/event-orders.ts`；**新增：** `lib/tickets/eligibility.ts`（server-only），必要時共用現有會員資格 resolver。

**介面：** `createTicketCheckout` 的輸入增加 server-resolved `actor: Actor`，只能由內部 service 傳入；public action export 仍僅 `(previous, formData)`。`TicketEvent`／LockedEvent 投影加入 visibility、legacy memberOnly；repo transaction 依 actor 與 current membership 判斷，不能只依 `buyerProfileId` 或表單旗標。

- [ ] 擴充 `tests/unit/ticket-checkout-core.test.ts`、`event-orders-repository.test.ts`：匿名 public 可買；匿名 members_only 拒絕且 `insertOrder`／Stripe 零呼叫；過期不合資格拒絕；目前政策認可的會員成功；invite_only 無有效邀請判斷時拒絕。
- [ ] 實作 server policy：legacy `memberOnly=true` 與新 visibility 不一致時採較嚴格限制，並回報待清理資料。身份讀取失敗不可降級而通過 private 活動；public guest 路徑可維持既有行為。
- [ ] 鎖 event 後重新檢查資格、發佈、截止、價格、capacity；重用既有 entitlement 判斷及公司席位撤銷規則。資格判定與下單以一致 transaction／鎖順序處理，避免資格讀取與寫入脫節。
- [ ] 保留同一 attempt 的既有 session；對被撤銷資格的未完成付款，不建立新 session；記錄需要 provider expire／既有 webhook 政策處理，不能單純忽略已付款 webhook。
- [ ] 加 `tests/integration/ticket-eligibility-postgres.test.ts`：真實 DB、最後一席併發、actor 偽造、撤銷公司席位；直接呼叫 write service 也被拒。

**政策邊界：** 此修復至少核實購買者資格。若活動要求「每位出席者均為會員」，在資料模型未能逐位驗證前，禁止該限制組合售票，不能用買家合資格替代所有出席者合資格。未確認 invitation 模型先 fail closed，不新造邀請真值。

**驗收／commit：** 修復後直接跑最新 repository 的回歸，不沿用會把缺陷標 PASS 的附件 stub；`fix: enforce ticket purchase eligibility`。

## T03 — 補齊活動 CMS 欄位與模式切換（F03）

**修改：** `components/admin/event-form.tsx`、`lib/admin/event-form-input.ts`、`lib/admin/event-action-core.ts`、`lib/db/repos/events.ts`、messages。

**介面：** `eventFormInput` 延伸至現有 event schema 的 `externalRegistrationUrl`、`format`、`onlineUrl`、`tags`、visibility；保留 Asia/Hong_Kong datetime 轉換。validation-failure state 必須保存所有新增欄位。

- [ ] `tests/unit/event-form-contract.test.tsx`：external + HTTPS URL 可 create／edit 往返；空白／非 http(s) URL 拒絕；invalid date 仍保留 URL／tags；切換 registrationMode 不留下不適用價格或外部網址。
- [ ] UI 條件式顯示 URL／online location／price；format、tags 與 public filter 共用實際 catalog。複製既有值編輯不得默默清空。
- [ ] 更新 parser、schema、repo insert/update、preview 與錯誤回填；不能只加一個輸入框。與 T02 一致限制未支援的 visibility／ticket policy 組合。
- [ ] `tests/e2e/admin-event-authoring.spec.ts`：職員建立 external／online／hybrid／rsvp／ticketed，重開編輯及公共呈現正確。

**G／commit：** `fix: complete admin event registration fields`。

## T04 — 座位完整性、金額與付款恢復（F08、F23）

**修改：** `lib/tickets/checkout-actions.ts`、`checkout-core.ts`、`components/marketing/ticket-checkout-form.tsx`、`config/tickets.ts`、order repo。**新增（若無等價）：** `lib/tickets/checkout-input.ts`、`lib/tickets/checkout-recovery.ts`、`app/api/events/checkout-recovery/route.ts`。新增 recovery schema 及 migration 見下。

**介面：** `parseTicketCheckoutForm(formData)` 回 `quantity` 及 exactly quantity 筆 seats／field errors；quantity 為整數 1..`MAX_TICKET_SEATS`（現為 10）。server 始終使用 event DB 單價；existing attempt identity 及 payload consistency 保留。

- [ ] `tests/unit/ticket-seat-input.test.ts`：3 位只填1位 → invalid；quantity 0／11／小數／missing／extra-index 拒絕；完整3位 → seats.length=3。超出 quantity 的非空資料不能悄悄遺棄。
- [ ] 將 quantity 真正提交；已選列不能 skip；client 可明確刪除座位、使用「我也是出席者」填第1位，顯示每位與總額、日期、付款性質及已核准退款資訊。
- [ ] 恢復設計：同一瀏覽器以 server 發出的高熵 recovery cookie／capability 定位 pending attempt；只存 token digest，限定 event／expiry，不把 raw token 放 logs／URL。Authenticated recovery 額外檢查 owner。沿用現有 idempotency key 不能直接當查看個資的授權。
- [ ] 若沒有適用的既有 capability storage，新增 `event_checkout_recoveries`：id、orderId（FK）、recoveryDigest（unique）、expiresAt、createdAt、invalidatedAt；raw token 只放 HttpOnly/Secure/SameSite=Lax cookie。GET recovery endpoint 只讀已授權摘要，private/no-store，查不到與無權使用一致回應；mutation action 才建立／撤銷 token。
- [ ] 頁面 reload／Stripe cancel 讀回 pending attempt 摘要，避免新 mount 自動產生第二 payable session。若要改 seats，先按現有 provider 狀態處理舊 session，未確認 expired 不產生替代付款。
- [ ] `tests/e2e/ticket-checkout-recovery.spec.ts`：1／3／10位、回站、reload、雙擊、unknown token、另一會員讀取、過期 hold／仍 open provider session；無第二 payable session、金額由 server 校驗。

**G／commit：** `fix: validate ticket quantity and resume checkout`。不要承諾跨裝置 guest 恢復；本輪範圍是同瀏覽器與已登入 owner 的安全恢復。

## T05 — 會員付款取消、完成與延遲 webhook（F05、F09）

**修改：** `lib/billing/checkout-service.ts`、`app/[locale]/(join)/join/checkout/page.tsx`、`join/actions.ts`、`join/complete/page.tsx`、`components/billing/checkout-status.tsx`。**新增：** `lib/billing/member-checkout-status.ts` 及 `app/api/membership/checkout-status/route.ts`（如已有等價 status endpoint 則重用）。

**介面：** `readMembershipCheckoutStatus(actor: Actor, membershipId: string)` 回既有 `processing | active | review | failed` display status；route 自行 resolve actor、驗 membership owner／company 權限、`Cache-Control: private, no-store`，不暴露 Stripe secrets。`beginMembershipCheckoutAction(formData)` 才建立／恢復 session。

- [ ] `tests/unit/membership-checkout-navigation.test.ts`：cancelURL 回本地 summary；GET summary 不呼叫 Stripe create；未授權讀 status 拒絕；success query 不直接把會員設 active。
- [ ] checkout GET 改為費用／狀態摘要；「繼續付款」POST 才 redirect；「稍後處理」返回入會進度，「更改資料」遵從 pending attempt lifecycle，不直接換價。
- [ ] 完成頁 processing 每3秒查詢，最多20次；unmount／terminal 停止。超過60秒顯示仍處理中與手動查核／支援，不改 failed、不建立新 checkout。active 顯示真實 portal 入口，review 顯示真實下一步。
- [ ] `tests/e2e/membership-checkout.spec.ts`：Stripe test success／cancel／decline／3DS、webhook 早晚到／重播／async success；owner-only status、防輪詢洩漏、同一 attempt 重試。

**G／commit：** `fix: complete membership checkout return flow`。3秒／60秒為本計劃的 UX 初始常數，集中設定，非審核量測。

## T06 — 會員列表與 Member 360 一致（F02、F12、F13）

**修改：** `components/admin/member-table.tsx`、`member-360.tsx`、`lib/db/repos/admin-members.ts`、`lib/admin/member-types.ts`、兩個 admin/members pages。**新增：** `lib/admin/membership-summary.ts`。

**介面：** 共用 `membershipSummaryOrder` 定義 SQL 與 service 的一致排序：沿用列表 status priority（active、past_due、cancel_at_period_end、pending_review、pending_payment、cancelled、expired）、再 membershipId，company tie-break 保留。不要另加與付款政策不一致的「有效」計算。Summary 帶 membershipId／companyId；詳情列出全部關聯會籍。

- [ ] `tests/unit/admin-member-summary.test.ts`：同一人的 active 與較晚 billingPeriodEnd expired 並存，列表／詳情選同一 membership；兩公司不混淆。
- [ ] 名稱和查看按鈕可開 detail；加入帶合法列表 query 的返回連結，拒絕外部 return URL；上一頁／下一頁及鍵盤操作可用。
- [ ] 狀態／plan／日期本地化，Asia/Hong_Kong 顯示；notes 顯示職員姓名並保留 audit ID。
- [ ] Member 360 加 purchase history：以可信 buyerProfileId 取得 orders／seats／refund 狀態，區分購買者與出席者。未知 guest 歷史不要按未驗證 email 自動合併。
- [ ] `tests/integration/member-360-purchases.test.ts` 與 `tests/e2e/admin-members.spec.ts`：存在票務記錄、正確 owner、跨會員不可讀；搜尋→詳情→返回維持條件。

**G／commit：** `fix: connect consistent member detail workflows`。

## T07 — 入會開始與續辦可重入（F10）

**修改：** `lib/membership/join-service.ts`、`onboarding.ts`、`lib/db/repos/applications.ts`、`app/[locale]/(join)/join/page.tsx`、`actions.ts`、相關 company/profile pages。

**介面：** 新增 `resumeOrStartJoin(actor: Actor, input: JoinInput, dependencies?): Promise<StartJoinResult>`，可內部改用既有 `startJoin` 對外 API；resume key 是 actor + plan + ownership target。target 未選公司時用明確 unassigned draft scope，選公司後更新／核對 scope。

- [ ] `tests/integration/join-resume.test.ts`：同一 scope 並發兩次只一份 resumable application；不同公司／plan 不誤續辦；pending_payment／pending_review 回正確步驟；別人的 applicationId 拒絕。
- [ ] GET join 只讀狀態／顯示續辦；建立或明確新申請走 action，防 prefetch／refresh 寫入。magic-link 回站保留合法 plan／resume intent，不提供 open redirect。
- [ ] 使用 transaction lock／現有可用 uniqueness 保證 find-or-create 原子；加入新的 partial unique index 前先產出既有重複草稿報告，不自動刪有付款／審批歷史的 rows。
- [ ] 顯示最後儲存、步驟、繼續／新申請。已完成／已有效會員引導既有帳戶；計劃切換不覆蓋付費 attempt。
- [ ] `tests/e2e/join-resume.spec.ts`：重新由 membership CTA 進入、magic-link 到期、跨裝置登入、重複 tab、company change。

**G／commit：** `fix: resume membership applications safely`。

## T08 — 訪客簽到與統一現場操作（F06）

**修改：** `components/admin/attendee-table.tsx`、`lib/admin/event-actions.ts`／core、`lib/db/repos/event-guests.ts`、events attendee projection。

**介面：** server-only `checkInGuest(actor: Actor, input: {eventId: string; registrationId: string})` 回 `checked_in | already_checked_in | ineligible`；public staff action 自行 resolve actor。名單保留 member／guest／ticket 三種 discriminant 與不同 ID。

- [ ] `tests/integration/guest-check-in.test.ts`：confirmed guest 一次成功、重複不多一份 audit；waitlisted／cancelled／另一 event／anonymous 拒絕，已取消活動不簽到。
- [ ] DB transaction 寫 checkedInAt + audit；schema 若缺欄位以 additive migration 加入，不改 member/ticket ID 語義。
- [ ] 簽到按鈕與 feedback 三類一致；現場可姓名／email／票號搜尋，不預設所有人都是會員。先接現有列表，T11 分頁時保留。
- [ ] `tests/e2e/event-check-in.spec.ts`：390px 現場操作、重複操作、screen reader 狀態；QR 個資與票券 token 不寫畫面診斷。

**G／commit：** `feat: support guest event check-in`。

## T09 — 免費 RSVP 取消通知可恢復（F07、F25）

**修改：** `lib/db/repos/events.ts` cancellation flow、`lib/admin/event-actions.ts`、相關 email templates、`workers/src/index.ts`。**新增（如無等價）：** `lib/events/cancellation-notifications.ts`、`lib/db/repos/event-notifications.ts`、`lib/jobs/event-notification-runner.ts`、`app/api/jobs/event-notifications/route.ts`。

**介面：** cancellation transaction 同時寫入唯一 event-cancellation intent；`enqueueCancellationNotifications(eventId, cancellationRevision)` 在可重試 chunk 中將 eligible RSVP recipient snapshot 展開。unique key `(eventId, cancellationRevision, registrationKind, registrationId, channel)`；不能在頁面 action 同步寄全場。

- [ ] `tests/integration/event-cancellation-notices.test.ts`：confirmed member／guest／waitlist 都入列；已自行取消者不納入；重按 cancel 只一份通知；取消 transaction rollback 沒有孤兒通知。
- [ ] 若收件人多，使用同一事件鎖／事件狀態阻止取消後新 RSVP，先持久化 intent 再分頁展開，checkpoint 保證 worker crash 不漏人；不得取消成功後只 enqueue 一次易丟失的 in-memory promise。
- [ ] 重用既有 transactional email eligibility、suppression、locale、outbox claim／lease／provider idempotency。marketing opt-out 不自動排除服務通知，但不可繞過 hard bounce／invalid address 等適用阻擋；blocked 項可見。
- [ ] Staff cancellation preview 顯示通知對象數與 blocked 數，執行後顯示 queued／accepted／delivered（若有 provider receipt）／failed。不可把 provider accepted 等同 delivered。
- [ ] 接通 cron route auth、worker job registry／cron config／env validation；檢查既有 ticket refund notices 防重複覆蓋。模擬 provider timeout、send 後 crash、重試、worker overlap。

**G／commit：** `feat: deliver durable RSVP cancellation notices`。保證可恢復和有效 idempotency；跨外部 provider 不宣稱無條件 exactly-once。

## T10 — 公開內容、導覽及登入體驗（F16–F20）

**修改：** `components/home/market-products.tsx`、`hero.tsx`、`lib/events/status.ts`、`scripts/archive-demo-content.ts`、messages；T00 定位的 public navigation／membership／showcase／member-login 元件。**新增：** `docs/content/hkwtia-policy-copy-matrix.md`。

**介面：** Event display 分開 lifecycle `upcoming | ongoing | ended | cancelled` 與 registration `open | full | waitlist | closed`，實際 union 沿用現有 code 相容轉換；注入 `now` 便於日期測試。

- [ ] `tests/unit/event-display-status.test.ts`：以香港日期測試開始前、開始時、結束時、取消、滿額；10月3日活動在9月26日不得顯示「進行中」。
- [ ] 對 demo event 建立明確 metadata／現有 demo marker 的 production publish guard。archive script 預設 dry-run，輸出精確 IDs、before/after、關聯 registration/orders，支援指定核准 IDs unpublish／restore；不要用標題含 demo 就批量刪除。
- [ ] demo 不進首頁、搜尋、推薦及 sitemap；直接 URL 不可接受真實報名。已有真實參加／付款關聯的資料單獨列出，不能破壞票券／退款路徑。正式資料 cleanup 留待 runbook 的具體授權操作。
- [ ] 「會員名錄」→ `/members`、「方案展示」→ `/showcase`；搜尋若仍只搜尋方案，名稱／aria-label 清楚標示。empty state 分清未有公開資料與 filter 無結果。
- [ ] membership／home 使用同一 plans catalog；逐項 FAQ 回答已核准資格、價錢、續費、付款、公司席位、審批、退款／invoice。policy matrix 每條列來源／狀態；未知內容用真實支援入口處理，不捏造承諾。保留品牌法定名稱待確認，不自行 rename。
- [ ] member-login 加 brand shell、首頁、入會、收不到信／重寄及支援；安全 returnTo、保留 plan 上下文。加入 header「會員登入」，避免登入框佔滿桌面；保留 magic-link auth。
- [ ] `tests/e2e/public-navigation.spec.ts`：en／zh 入口、FAQ、未篩選空結果、登入返回、390／768／1440px，無水平溢出／字詞不合理拆行；axe 和鍵盤核心操作。

**G／commit：** 可分 content 與 navigation 兩個 commit。單純字體／文案微調不加 source-text snapshot 測試；以既有 i18n／browser 驗收。

## T11 — 詳情按需載入與歷史分頁（F14、F15）

**修改：** `lib/db/repos/admin-members.ts`、`events.ts`、`event-orders.ts`、`components/admin/member-360.tsx`、`app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx`、attendee/orders tables。

**介面：** 新增並 export 共享 `CursorPage<T> = {items: readonly T[]; nextCursor: string | null}` 於 `lib/admin/pagination.ts`。`getAdminEventById(actor,eventId)`；`listEventAttendeePage(actor,eventId,query)`、`listEventOrderPage(...)`；`getMemberTimelinePage(actor,profileId,kind,query)`。query 包含 cursor、limit（預設20、上限50）、支援欄位搜尋；所有 API 自行驗 actor／target。

- [ ] `tests/integration/admin-pagination.test.ts`：同 timestamp 多筆穩定 cursor、無漏／重複、無限大 limit 被拒；member/guest/ticket UNION 使用 `(kind,id)` tie-break 防 ID collision。
- [ ] event editor 按 ID 查，不 list all 再 find；把內容、出席者、訂單／退款、通知 tabs 分開 load。取消 preview 與 totals 可用聚合查詢，不拉全量 rows。
- [ ] Member 360 首屏只必要摘要；獨立摘要可並行但限制 pool fan-out；歷史分頁／lazy load，不把所有 timeline 再 Promise.all 全量讀。
- [ ] 真實 DB 建10k合成會員／500活動參加者，保存 query count、EXPLAIN ANALYZE、server p50/p95；profile detail 和 event content GET 不載入未開 tab 的全量資料。

**G／commit：** `perf: paginate admin histories and event operations`。CSV 全量匯出交 T13／T16 background，不讓頁面為匯出先載入所有 rows。

## T12 — 會員營運篩選、saved views 與多選（F11、F12）

**修改：** `lib/admin/member-types.ts`、`lib/db/repos/admin-members.ts`、member table/page、`config/internal-navigation.ts`、`components/internal-shell/navigation.tsx`。**新增：** `lib/admin/member-query.ts`、`member-selection.ts`、`components/admin/member-filters.tsx`、`member-bulk-toolbar.tsx`、saved-view repo（重用 segments storage 的適用部分）。

**介面：** 擴充 `AdminMemberQuery`：search、status[]、planCode[]、renewalFrom/To、companyId、locale、completeness、sort、limit、cursor，嚴格 whitelist；Cursor 帶 sort/filter fingerprint，不可混用另一查詢。`MemberSelection = {mode:'ids'; profileIds:string[]} | {mode:'query'; query:AdminMemberQuery; excludedProfileIds:string[]}`。

- [ ] `tests/integration/member-filter-selection.test.ts`：OR／空篩選不能意外擴大受眾；多公司會員按「符合條件的 membership」比對，回 matchingMembershipIds，不以 representative row 代替 filter match。日期邊界採香港日轉 UTC。
- [ ] 預設 views：有效、30／60／90天到期、欠費、屆滿、欠資料；待完成入會／待付款／待審批需讀 applications／billing 真正狀態，必要時是獨立 entity view，不把 application ID 當 profile ID。
- [ ] 前端條件可分享 URL、返回保留、清除／重設 cursor；保存個人 view，shared view 依現行 staff 權限。labels、timezone、empty/error/loading state 完整。
- [ ] checkbox 先「已選本頁20位」，再明確「選取符合條件的全部N位」；修改 filter 清除 selection 或要求確認，不默默把新查詢套入既有選擇。
- [ ] 第一層導航整理為工作台／會員與機構／活動／通訊與跟進／內容與設定；保留全部原 route 和 permission，不刪既有 CRM／Segments／Campaigns。group label 可讀，不只英文字 key。
- [ ] `tests/e2e/member-workspace.spec.ts`：搜尋→saved view→多選→preview→返回、鍵盤及手機；distinct profile 數與 membership scope 清楚。

**G／commit：** `feat: add member operations views and selection`。

## T13 — 批量引擎：snapshot、lease、結果、重試（F11、F25）

**新增：** `lib/admin/batches/types.ts`、`service.ts`、`actions.ts`、`lib/db/repos/admin-batches.ts`、`lib/jobs/admin-batch-runner.ts`、`app/api/jobs/admin-batches/route.ts`、`components/admin/batch-preview.tsx`、`batch-progress.tsx`、`app/[locale]/(admin)/admin/batches/[id]/page.tsx`。修改 schema／下一個 migration、worker registry／cron。

**資料契約（新增，採既有等價表優先）：**

| 表 | 必要欄位／約束 |
|---|---|
| admin_batches | id、actorProfileId、operation、validatedPayload、idempotencyKey、querySnapshot、state、previewDigest、previewExpiresAt、createdAt、counters；unique(actorProfileId,idempotencyKey) |
| admin_batch_items | id、batchId、targetType、targetId、expectedVersion/digest、before/after summary、state、attemptCount、nextAttemptAt、leaseOwner、leaseExpiresAt、effectKey、resultRef、errorCode；unique(batchId,targetType,targetId) |
| import_runs / import_rows | T14 的 staging，fileDigest、mappingVersion、rowNumber、validatedPayload、validationStatus、matchTargetId、conflictReason、batchItemId |

**公開結果狀態：** batch `preparing | ready | queued | running | completed | completed_with_errors | cancelled | expired`；item `pending | running | succeeded | skipped | failed`。`skipped` 不是 success；預覽阻塞項不入 execution queue。

**server-only 介面：**

```ts
// AdminActor 沿用 repo；由 action / cron wrapper 解析，永不由 client 提交。
prepareBatch(actor: AdminActor, input: BatchRequest): Promise<{batchId: string}>
getBatchPreview(actor: AdminActor, batchId: string): Promise<BatchPreview>
commitBatch(actor: AdminActor, input: {batchId: string; previewDigest: string}): Promise<BatchSummary>
retryFailedBatchItems(actor: AdminActor, batchId: string): Promise<BatchSummary>
cancelPendingBatchItems(actor: AdminActor, batchId: string): Promise<BatchSummary>
```

`BatchRequest` 的 operation 為 discriminated union：`profile_patch | import_commit | membership_grant | renewal_reminder | profile_update_invite | ticket_resend | export_members`；每個 handler 各自 schema／capability，T14–T16 才接通。raw SQL、arbitrary field patch、subscription status 不在 union。Preview 保存總數、eligible、skipped、blocked、逐項原因及 digest；所有權限仍以 backend 判定。

- [ ] `tests/integration/admin-batch-snapshot.test.ts`：preview 後新增符合者不被納入；query selection + excludes 數量正確；digest tamper／expired／他人 batch 拒絕。snapshot materialization 用一致 DB snapshot，不能分頁過程讀不同時刻名單；大型準備工作在 worker 做，初始上限5000項、每claim50項、preview TTL30分鐘為可配置運作預設。
- [ ] `tests/integration/admin-batch-concurrency.test.ts`：兩個 worker 以 `FOR UPDATE SKIP LOCKED` claim，lease crash 可恢復；同一 effectKey 只一份業務變更＋audit；舊 worker 過期後不能覆寫新 lease 結果（fencing token／版本比較）。
- [ ] commit transaction 核對 snapshot、權限、payload digest 後 queue；執行逐項重新讀 role／scope／version／資格。撤權者尚未執行 items 停止／skipped，不能沿用 preview 時的 privilege。
- [ ] DB-only 操作將 mutation + audit + item success 原子提交；外部副作用先持久化 outbox／effectKey，再調 provider，處理 timeout/unknown outcome。禁止 worker timeout 後無條件重發。
- [ ] retry 只處理 retryable failed 且仍符合條件項，沿用 effectKey；成功項不重做。cancel 只停止未執行項，in-flight 留待結果，不宣稱已寄郵件可 Undo。
- [ ] Progress 頁顯示 pending/running/succeeded/skipped/failed、逐項原因、結果下載、重試失敗與取消剩餘；query polling 只在活動中。離開再回仍看到進度。
- [ ] 配置 retry 初值最多5次，backoff 1/5/15/60分鐘；超限 dead-letter 待職員處理；錯誤碼分 transient/conflict/authorization/ineligible。

**G／commit：** `feat: add durable admin batch operations`。不要在泛用 runner 放入每個 domain 的全部規則。

## T14 — 會員匯入、資料整理與衝突處理（F11）

**依賴：** T12／T13。**新增：** `lib/admin/imports/{parse,validate,match,service}.ts`、`components/admin/member-import-wizard.tsx`、`app/[locale]/(admin)/admin/members/import/page.tsx`；必要時 member operations metadata schema／repo。

**介面：** `validateMemberImport(actor, input:{uploadId:string; mapping:ImportMapping}): Promise<ImportRunSummary>`；confirmed rows 轉 `import_commit` BatchRequest。row 結果為 create/update/unchanged/duplicate/conflict/invalid，未確認衝突不可 commit。

- [ ] `tests/unit/member-import-validation.test.ts`：UTF-8 BOM、quoted newline、zh-HK 姓名、空白值、重複 email、日期／locale／plan 錯誤；預設空格不覆蓋既有非空值。CSV 出口中以 `= + - @` 或控制字元起始值作公式注入防護。
- [ ] v1 支援 CSV／XLSX，初始上限10 MiB／5000 rows，明示限制；XLSX 只讀 cell values，拒絕 macros、公式、external links，不執行計算。T00 核對現有 parser；若需新 dependency，先記錄選型／maintainer／lockfile audit，不能臨時用未維護 parser。
- [ ] 五步 UI：上載→欄位配對→驗證→差異預覽→提交。只按可信 external/member ID 更新現有 profile；僅 email 相同列出 candidate 並要求確認，不自動合併身份。新資料若無安全 Auth provisioning 入口，先建立 CRM contact／待邀請記錄並明示尚非已開通會員，不能硬造 auth profile。
- [ ] 不允許匯入 consent=true、Stripe IDs／paid 狀態、角色、歷史付款；plan 欄位只能成待處理會籍建議，不自動贈送或假裝付款。
- [ ] 資料整理先允許 locale、營運標籤、負責職員；若 schema 尚無欄位，新建獨立營運 metadata 關聯 profile，不把現有欄位硬作他用。email／身份／公司關聯修改依專用驗證流程。
- [ ] `tests/integration/member-import-commit.test.ts`：同檔重跑不重複建檔；preview 後 row 被改則 conflict；部分失敗 downloadable；mutation/item/audit 同一 transaction。
- [ ] Upload storage 私人授權，原始檔預設7天自動刪除、staging30天清除；這是建議的運作預設，啟用前與現有 retention policy 比對，不刪法定 audit。畫面／log 不輸出完整 PII。

**G／commit：** `feat: add previewed member imports and bulk edits`。身份 merge 不作一次 bulk irreversible merge；另列人工解決 queue。

## T15 — 有理由、目標及有效期的贈送會籍（F22）

**依賴：** T06、T13。**修改：** `lib/db/repos/admin-membership.ts`、`components/admin/membership-comp-form.tsx`、既有 membership resolver／lifecycle；**新增：** `lib/membership/grants.ts`、grant schema/repo、expiry runner（若既有 lifecycle job 可擴充則重用）。

**介面：** `MembershipGrantInput` 包含 `target: {kind:'profile'; profileId:string} | {kind:'company'; companyId:string}`、planCode、effectiveAt、expiresAt、reason；owner XOR company 由 schema／DB 雙重保證。grant validity 用獨立欄位／表，不冒用 `billingPeriodEnd`。

- [ ] `tests/integration/membership-grant.test.ts`：理由必填、start < expiry、公司與個人只能一種、plan seatAllowance 取 catalog、已有 live membership 衝突、並發不重複；不得寫 Stripe 欄位。
- [ ] 保留現有單筆 comp eligibility／權限；新增有限期 grant 可先交付。未有核准無限期／bulk／company policy 時，只完成 capability／UI／測試，對應新高影響選項以 feature flag 關閉，不更改歷史永久 comp。
- [ ] future grant 到期前不提供權益，effectiveAt 才生效；expiresAt 即使 cron 延遲，resolver 也不可持續授權。expiry job 只處理 grant，不改 paid subscriptions。
- [ ] 批量 grant 先選具體 target，再 preview 每個 target 的日期／plan／衝突與理由；commit 後 T13 handler 調同一 service，無第二套簡化 SQL。
- [ ] 若既有 approval model 足夠，重用其 actor/approval；否則新增擴大政策先限定已核准 capability，不能因 requireAdmin 已存在就假定所有 staff 可批量送會籍。

**G／commit：** `feat: add scoped membership grant validity`。價格／寬限／贈送期限是政策資料，不能把建議預設當協會已核准規則。

## T16 — 批量提醒、邀請、門票重寄與匯出（F11、F23、F25）

**依賴：** T09、T13；重用 `lib/admin/segments.ts`、`segment-actions.ts`、CSV、existing campaigns／email／WhatsApp jobs；**新增：** `lib/admin/batches/handlers/{profile-patch,renewal-reminder,profile-update-invite,ticket-resend,export-members}.ts`。

**介面：** 每個 operation handler 接受已驗證 target + payload + stable effectKey，回 `succeeded(resultRef) | skipped(reason) | retryable(errorCode) | failed(errorCode)`；`profile-patch` handler 實作 T14 指定的允許欄位，`import_commit`／`membership_grant` handler 分別位於 T14 import service／T15 grants service，由 T13 registry 註冊，不另造規則。renewal scope 固定 membershipId，不能拿 profileId 任選一個會籍催款。

- [ ] `tests/integration/bulk-communication-eligibility.test.ts`：preview 後已續會不再提醒；language、channel eligibility、unsubscribe／suppression 重新核實；同一 profile 多 membership 的提醒內容與目標一致；相同 email 去重規則不跨公司暴露付款資料。
- [ ] reuse Segments／Campaigns 的模板／資格／審閱／發送記錄；區分 transactional／marketing，不自行把促銷改標 transactional；WhatsApp 只用已核准 locale template，缺模板則 skipped，不降級為其他語言發送。
- [ ] update invitation 使用 owner-scoped、限時的一次性流程／現有登入，不讓邀請網址直接以任意 profile ID 更新資料；回傳資料更動仍驗證。
- [ ] ticket resend 只對有權操作且目前有效票券，依目前 refund/cancel/seat 狀態判斷；一項一個 effectKey，不透過批次偽造新的 payment status。
- [ ] export 使用同一 snapshot/filter、最少所需欄位、私人短期下載、audit；列數與選取一致，敏感 token／Stripe secret 不輸出，公式防護沿用 T14。
- [ ] `tests/e2e/admin-batches.spec.ts`：選10人→preview→執行→2項失敗→只重試2項；成功8項不重發。全程使用 test recipients/sink，不測正式群發。

**G／commit：** `feat: connect member batch workflows to existing delivery services`。

## T17 — 共用限流、public cache 及通知容量（F21、F24、F25）

**修改：** `lib/events/guest-registration-action.ts`、`lib/tickets/checkout-actions.ts`、`app/[locale]/(public)/page.tsx`、public layout／section readers、`lib/billing/ticket-email-runner.ts`、worker config；**新增（如無等價）：** `lib/security/shared-rate-limit.ts`、`lib/db/repos/rate-limit.ts`、必要 schema/migration。

**介面：** `consumeRateLimit({scope,keyHash,now}): Promise<{allowed:boolean;retryAfterSeconds:number}>`，跨實例原子儲存。沿用 guest/ticket 現有5次／15分鐘初始政策，使用既有可信 proxy IP resolver；identity／event 作額外維度，不信任未驗證 client header。

- [ ] `tests/integration/shared-rate-limit.test.ts`：2個 service instance 合計第6次被拒、冷啟動不重置、TTL清除、儲存故障按現有 fail-closed 政策可恢復回應；不用 process-local fallback 靜默放行。
- [ ] 優先用現有 shared store；未有則 Postgres 原子 UPSERT／transaction，避免新增無必要 paid service。IP 使用 server keyed digest＋TTL，不在 log 存 raw IP。首次修復不任意新加家庭／公司共享網絡的封鎖規則。
- [ ] 評估 pending hold 上限以壓測證據決定，合法10位團體訂單不得被錯殺；同 attempt retry 不多佔 hold。
- [ ] public data reader 快取 locale／filters，CMS mutation 做明確 tag/path invalidation；hero/shell 可先輸出，慢 section 用 Suspense。不能直接刪 force-dynamic 就宣稱 ISR 成功，先確認 layout/session/cookies 的依賴。
- [ ] `tests/e2e/public-cache-isolation.spec.ts`：A會員／B會員／guest 無互相資料；CMS edit 正確失效；語言和 filter 不串；慢 section 不阻塞所有內容。
- [ ] queue 以 oldestPendingAge、backlog、provider latency 量測；由現有 ticket batch3及每分鐘觸發作基準。只在 load test 證明需要後調 chunk/concurrency，維持 lease／provider限流／timeout；模擬500張票、provider outage後恢復。
- [ ] 保存相同地區／裝置／網絡的多次 Lighthouse與RUM方案，不能把 audit proxy TTFB 10–14秒當香港用戶 baseline。EXPLAIN 後才新增 indexes。

**G／commit：** 分為 `fix: share registration rate limits`、`perf: cache public content and bound delivery work`。

## T18 — 全流程驗收、可觀測性與正式交付（F25；全25項）

**修改：** 現有 CI／Playwright／Lighthouse workflow（T00確認精確檔案）、deployment health／logging；**新增：** `tests/e2e/hkwtia-critical-journeys.spec.ts`、既定 audit verification／release runbook。

- [ ] CI 保留現有 lint/typecheck/build/audit/Vitest shards；加入 preview E2E 與具備真實 test DB／Stripe test mode 的 nightly 或可控手動 integration job。secret 缺失標明未驗收，不只 `skip` 後綠燈。
- [ ] 執行下表旅程；每條記錄 SHA、環境、fixture、預期／實際、artifact。權限拒絕必須斷言無 side effect，不只 HTTP response。
- [ ] 加 structured errors／requestId、error rate、webhook lag、oldest pending、batch failures、worker last success。初始告警提案：付款 webhook處理lag >5分鐘、通知 oldest pending >5分鐘、critical cron連續3次未成功；驗證測試訊號能觸發與恢復，閾值標為配置不是既有SLA。
- [ ] 關聯 web deployment SHA、DB migration version、worker version。報告「CI pass／staging驗收／production smoke」分欄，不把前兩者代替已上線。
- [ ] 完成下述 migration／release／rollback 演練及全 gate；更新 README 操作說明與職員短指南（search、bulk、import、failed retry、cancellation、check-in）。

### 必須執行的旅程

| 旅程 | 正常／故障／併發覆蓋 |
|---|---|
| anonymous/member/staff/exco/superadmin | 現有角色權限、action actor forgery、越權讀取、權限中途撤回 |
| join | 社群／初創／企業、續辦、公司選擇、magic-link失效、兩個tab並發 |
| membership billing | success/cancel/decline/3DS、webhook延遲／重播／async、completion pending、其他會員不能讀 |
| event authoring | rsvp/external/ticketed、online/hybrid、模式切換、時間／URL／tags往返 |
| RSVP/tickets | invalid/duplicate/full/waitlist、1/3/10席、匿名/private拒絕、最後名額併發、取消/恢復checkout |
| cancellation/refunds | 免費通知、付費退款原流程、provider unknown/retry、不重複退款或通知 |
| check-in | member/guest/ticket、重複、waitlist/cancelled/refunded拒絕、手機 |
| member operations | 多會籍一致、購票歷史、篩選/saved view、全選與排除、preview後資料變更 |
| bulk/import | 5000列、部分失敗、lease恢復、兩worker、重跑、撤權、consent變更、匯出公式防護 |
| public/accessibility | en/zh、390/768/1440px、keyboard、axe critical/serious零新增、真實empty states與CTA |

### Gate commands（執行前按當前 package scripts 校對）

```bash
npm run audit:strings
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm audit --omit=dev --audit-level=high
```

`npm run test:lighthouse` 按現有 config 指向 preview／已授權 public 讀取，報告每URL多次 median及限制。DB integration 套用 repo guard；測試讀取 `DATABASE_URL_TEST`，不得在文件列出真實值。

### 效能驗收目標（建議目標，不是已達成承諾）

- 合成10k會員，搜尋/篩選 server p95 <800ms；limit20–50，保存query plan及硬體／pool背景。
- 500位出席者活動：內容編輯不等候全量 attendees/orders；歷史 cursor 正確，無N+1膨脹。
- 5000列匯入／批次：HTTP提交快速回batch ID，不等待全部effects；處理中離開再回能續看；最終逐項數量相符。
- RUM p75目標 LCP≤2.5s、INP≤200ms、CLS≤0.1；新版本沒有足夠RUM時寫明觀測中，不聲稱通過。Lighthouse是實驗室證據，不能替代INP/RUM。

## 1. Migration、啟用及回復

1. **Expand first：** 新表／nullable欄位／必要索引先新增，舊程式仍可讀；下一個 migration number 由目前 journal 產生，不照附件猜號，不重寫已套用 migration。
2. **Review generated SQL：** 檢查 constraints、FK、index、view／materialized view；保留現有 raw SQL index。不得把 drop/create view 當無風險。需 CONCURRENTLY 的 index 要用 runner 支援的非transaction步驟。
3. **Test old/new：** 隔離 DB 跑 migration、兩次seed（只測試DB）、新舊程式相容性、重複資料報告、rollback演練。舊draft、永久comp、registered demo、既有outbox要各有fixture。
4. **Flags：** 首先部署以預設關閉的新bulk/import/grant handler；既有 critical bugfix 可獨立啟用。新schema與web code先到位，後部署worker，確認cron auth/env/registry/last success，再開內部測試staff功能。
5. **Release evidence：** 記錄 web+worker SHA、migration、Stripe test結果、seed guard、browser旅程、queue health；先生成具體reviewable release，再依當時既有授權決定正式部署。
6. **Production smoke：** 未授權寫入時僅公共讀取／登入讀取；會員申請、發信、付款、退款、cleanup另按具體授權與測試身份執行。不能為smoke寄給全體會員。
7. **Rollback：** 關相關flag／pause新queue claims；等待或記錄in-flight effects，回退web/worker至仍相容schema的版本；保留outbox／batches／audit，不drop表或清空queue。已發訊息／款項不可回復，以對賬／補償處理。
8. **Cleanup：** demo unpublish按dry-run精確IDs，已有關聯資料另處理；production資料不因schema migration順便刪除。回復由before-state manifest恢復可公開狀態，不重新啟動已取消報名。

## 2. Finding → Task 完整對照

| Finding | 主責任務 | 必須留下的證據 |
|---|---|---|
| F01 | T01 | 無效表單無side effect、browser留在原頁、server errorId |
| F02 | T06 | 會員列表到詳情再返回的E2E |
| F03 | T03 | external表單→parser→repo往返 |
| F04 | T02 | 直接write拒絕未合資格actor、DB併發 |
| F05 | T05 | Stripe cancel留本地summary，GET零create |
| F06 | T08 | guest合法／非法／重複簽到 |
| F07 | T09 | cancellation intent/outbox/重試與recipient證據 |
| F08 | T04 | quantity3空2列拒絕，完整3列成功 |
| F09 | T05 | delayed webhook更新、輪詢停止、owner-only |
| F10 | T07 | refresh不寫入、兩tab只一個resumable draft |
| F11 | T12–T16 | saved views、多選、snapshot、import、結果與重試 |
| F12 | T06、T12 | 多會籍代表／命中scope一致 |
| F13 | T06 | Member360可見本人票務歷史且不串人 |
| F14 | T11 | 有界timeline及query count／plan |
| F15 | T11 | event按ID、attendee/order分頁 |
| F16 | T10 | demo publish guard、cleanup dry-run與限制 |
| F17 | T10 | members/showcase/search各自正確入口 |
| F18 | T10 | 核准policy copy matrix與同catalog |
| F19 | T10 | 香港日期生命周期測試 |
| F20 | T10 | login shell/returnTo/支援/mobile |
| F21 | T17 | streaming/cache/invalidation/隔離及量測 |
| F22 | T15 | grant日期/理由/target/expiry/政策旗標 |
| F23 | T04、T16 | 總額、付款attempt恢復、安全重寄 |
| F24 | T17 | 跨instance第6次拒絕與hold不重複 |
| F25 | T00、T09、T13、T17、T18 | 部署對照、CI/staging/live分欄、worker與觀測 |

## 3. 自我檢查與最終交接

本計劃已按審核 F01–F25 對照；新增bulk能力屬審核第4節的實作設計，不能與已存在缺陷混寫。新常數（preview30分鐘／5000項／chunk50／retry5次／status60秒／檔案期限）均為本計劃的可配置運作預設，不是假稱現有系統設定。

尚需由執行環境／協會資料核實：最新HEAD是否已修；正式SHA；staff登入；Stripe test設定；正式worker/migration；FAQ／退款／grant policy；實際效能。這些是逐項gate，不是要求重新審批整份常規開發工作。

**Executor final response 必須包括：**

- 各Release／F編號完成與blocked狀態；branch／commits／PR及preview。
- 實際執行的測試與結果、skips、使用環境、效能數據及其限制。
- migrations／flags／worker／env新增名稱（無值）、部署先後及回復。
- 已驗證的職員旅程和仍需production／policy驗收之項。
- 明確分開「程式碼已修」、「staging已驗」、「正式已上線」，不可只說全部完成。

下一個實作 session 由 T00 開始，順序完成可執行任務。此文件不要求現在修改正式網站。

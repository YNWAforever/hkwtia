# 入會案件整理、草稿覆核及跟進備註 SOP

本次 T09 候選 `cdd7872a`／PR #130。exact CI6618pass／429skip及worker57、全部7checks已通過。Preview實際密碼角色與正向DB驗證17項、不同案件assertions13項（全輪通過）已驗；原儲存提示RED和test timing失敗均保留。這不是 full fix 或正式啟用。完整狀態見 tasks/status/acceptance CSV 與 evidence/t09。

## 職員人工流程

1. 以職員、ExCo 或 superadmin 的現有身份進入「會員及申請 → 入會跟進」。保留狀態、搜尋、每頁及 cursor；返回原列表沿案件的「返回」連結。
2. 開啟案件，先看申請、付款 attempt 及會籍三個獨立狀態。按「整理案件／起草補件通知」取得現行入會表單規則的建議；這不會呼叫 AI。
3. 必填姓名、startup/corporate 公司名稱或現行條件式 WhatsApp 驗證有問題才列出。電話、網站、公司規模及描述仍依原表單為選填；現有人工 checkbox 是跟進決定，不代表新增會籍政策。
4. pending payment 只指向既有付款查詢；completed attempt／linked subscription 而會籍仍 pending 時指向對帳。不要再次收款或用 comp 代替付款修復。
5. 按「採用跟進建議」只填入人工表單；已有備註會保留。核對 checkbox／下一步、負責人與香港時間期限，再獨立儲存。案件版本衝突時保留未儲存內容，重新讀取後人工核對，不覆蓋另一職員的版本。

## AI 草稿與採用

- `ADMIN_AI_APPLICATION_DRAFTS_ENABLED=false` 與 `AGENTS_ENABLED=false` 是本次 Preview 配置；預算為零。人工操作可繼續。程式的 application registry 預設未核准，僅設定 flag 或 API key 不會自動取得資料政策批准。
- 啟用生成前須核准 application 用途／資料政策及版本化 route，提供獨立 provider 測試憑證、run/day/month 費用上限，完成 T13 真模型字句／成本驗收。OpenCode/Go 未批准用途維持 off。
- 生成只使用 server 最小化的狀態與規則 facts，不送姓名、email、電話或原申請正文。request 前再次驗角色、facts、work lease、audit；provider receipt 在正文處理前持久化。
- Review沿現有 AiReviewPanel：改稿清除審核，拒絕只拒絕草稿，facts／source 改變必須 stale。正文驗證不相信模型自報 claims。
- 「儲存已審核跟進備註」需要 current approved version 與案件 CAS。其他編輯器有未儲存內容時停用。採用只沿既有 case writer 儲存最多1000字的跟進備註及audit；保留負責人／期限／checkbox／下一步／會籍與付款。這不是發送、批准入會或建立新的批准捷徑。
- 發送或付款操作必須另外走其原入口、角色、consent／provider規則。這輪沒有真發送、收款或退款。

## 錯誤、配置、發布與回退

- disabled/configuration：繼續人工；交由 AI/資料及費用責任人核准配置。
- unknown/provider accepted-timeout：以原 provider receipt 對帳，不換 key／facts 重送；TTL 不解除費用。未request的配置/預算失敗可重新嘗試，保留原 failed run，新的 run ID 不覆寫歷史。
- unavailable：檢查案件、審核、1000字限制與版本；不要截短正文後假稱已採用。寫入或審計失敗整筆回滾。
- T09沒有新migration；需要既有相容0057→0058→0059 ledger。Production migration／發布不由本輪開發／Preview授權推定。
- Rollout依能力分開：相容web→review/人工採用→核准generation→受控2職員/每日50cases/draft-only一週；worker／sender／付款各有自己的release gate。未完成的能力維持off。
- 回退關新生成/採用flags，再回相容web／worker；保留既有權益、draft/revision/audit、in-flight claims與unknown liabilities，不DROP或cleanup歷史資料。

## 可重現命令

PowerShell於獨立worktree執行；所有env檔及cookie保持ignored，不記錄值。

```powershell
$env:RUN_POSTGRES_INTEGRATION='1'
node node_modules/vitest/vitest.mjs run tests/integration/ai-application-triage.test.ts tests/integration/ai-draft-review.test.ts --maxWorkers=1
Remove-Item Env:RUN_POSTGRES_INTEGRATION
npm.cmd test -- --maxWorkers=2
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run audit:strings
```

真Preview首先核對非primary/default/protected分支、expiry、精確DB/Auth host、sentinel1、ledger59、保留域及唯一新聞marker正向證據，再以actual同origin Neon測試登入獲得actor。完成後可使用 `node --env-file=.env.local --conditions=react-server --import tsx scripts/seed-application-draft-acceptance.ts` 建立本輪合成案件；此script要求 `.playwright/full-fix-t09-preview-*safe.json` 及trusted Auth binding，不能在Production執行。Native命令為 `npm.cmd run test:e2e -- tests/e2e/ai-application-triage.spec.ts --project=chromium`，明確設定専用Preview baseURL及ignored保護session；trace/video off，缺隔離條件是skip，不是pass。

真Google／magic-link、真模型／sender、雲端worker兩窗口和no-profile申請恢復的完成證據仍分別由 T14A/B、T13、T02負責。這些不會被密碼登入、simulated model或sink回執取代。

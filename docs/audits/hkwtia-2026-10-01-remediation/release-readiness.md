# 完整修正候選：發布狀態與能力矩陣

候選／測試 source `99d5b11974644c06318da4f91d20bf39a8615b9a`；應用／worker與`3bc4c136`相同，99d5僅修改native test readiness。Preview `dpl_EHC8iFrft1EZr3u2efP3ffEVhdzP`，iad1，READY；最新17項runtime實際通過。歷史 d87 的17項和 e9fa6d02 的15項runtime證據分開保留，未冒充新候選驗收。程式與隔離範圍證據見 `status.csv`、`acceptance.csv`、`verification.md`。25 項 UAT 在列明範圍通過、33 項部分驗證、2 項受阻；**不是 full fix、全生命週期驗收或正式發布完成**。

正式 app 仍是 `e7fa4add247489f525f015007460fb522fb1531b`，`dpl_GYj8pTrvHxSZRDszXnVnCtkDS8rV`。最新 main `60a272b68c334d256d578ade36d8e24ca3be5485`。本輪没有 Production migration／部署／新 flag／付款／退款／訊息寫入。Production ledger/flags/provider credentials 無可用 readonly 權限，明確 UNKNOWN，不能從 Preview 推算。

## 發布矩陣

以下所有 Preview 新業務 flags 實際為 false，provider 為 TEST／email sink，`RUN_LIVE_WOZTELL=0`、agents/Google false。Production 狀態 UNKNOWN。每列 appSHA 為上述候選；workerSHA 在確實不需 worker 的能力標 N/A，其餘雲端 UNKNOWN，絕不填假部署。

| 能力 | appSHA | workerSHA | migration | flagName／Preview 狀態 | providerMode | UAT evidence | approvedAt | rollbackOwner |
|---|---|---|---|---|---|---|---|---|
| 登入／公開中英 UI、分群分頁 | 99d5b119 | N/A | existing | existing guards; no new flag | isolated Auth password; Google/mail pending | U01/U07/U08/U35/U55; t23 exact99 runtime17 passed | development/isolated only; release not approved | 技術負責人 |
| worker 健康 | 99d5b119 | cloud UNKNOWN; reviewed source/T11 local hash | 0052 | dedicated WORKER_JOB_ALLOWLIST=none dry-run only | no provider calls | U18/U57; t11/t23 | cloud transport/deploy/window gate pending | worker operator |
| 有界續會 | 99d5b119 | cloud UNKNOWN | 0053+0054 | current runner gates; no cloud enable | draft/outbox only | U18/U51; t12/t22 | D01/D04/D06 pending | membership + worker operator |
| 批次 core／歷史 | 99d5b119 | cloud UNKNOWN | existing | ADMIN_BATCH_ENABLED=false | PG16/Neon synthetic | U26-U31/U34; 24 scale cases; history readable flag-off | D06/provider pending | batch operator |
| 私人匯出 | 99d5b119 | cloud UNKNOWN | existing | MEMBER_EXPORT_ENABLED=false; EVENT_ATTENDEE_EXPORT_ENABLED=false | private synthetic artifacts | U33; t15/t22 | D06 pending | release + privacy operator |
| 匯入 | 99d5b119 | cloud UNKNOWN | existing | MEMBER_IMPORT_ENABLED=false | synthetic only | U32; t15/t22 browser2 | D06/provider invite pending | membership operator |
| 有限期 grant | 99d5b119 | cloud UNKNOWN for batch | existing | MEMBERSHIP_GRANTS_ENABLED=false; MEMBERSHIP_GRANT_BATCH_ENABLED=false; MEMBERSHIP_COMPANY_GRANTS_ENABLED=false | synthetic SQL; no real entitlements | U22-U25; t06/t22 | D03/D06 pending | governance owner |
| 通訊／票重發 | 99d5b119 | cloud UNKNOWN | existing | MEMBER_COMMUNICATION_BATCH_ENABLED=false; TICKET_RESEND_BATCH_ENABLED=false | reviewed draft/pass outbox; no real sends | U27/U30/U37-U38/U41/U44; t07/t14/t16/t19/t22 | D04 and approved sender/recipient/timeouts pending | communications operator |
| 政策確認／application follow-up | 99d5b119 | N/A for UI | existing additive metadata | MEMBERSHIP_POLICY_ACCEPTANCE_ENABLED=false | test registry only | U10-U14; t09/t10 | D01/D02 approved versions absent | membership + finance |
| paid repair／refund reconciliation | 99d5b119 | cloud UNKNOWN for outbox | 0055 | PAYMENT_RECONCILIATION_ENABLED=false; existing refund guards | actual Stripe TEST; no live money | U19/U40/U43; t08/t16 | D05/D06 pending | finance + release operator |
| CMS private drafts | 99d5b119 | N/A | 0056 | CMS_SERVER_DRAFTS_ENABLED=false | synthetic private versions | U46-U48; t04/t17/t21/t22 | old writers retire + D06 pending | CMS/release operator |
| Daily workspace/inbox | 99d5b119 | cloud UNKNOWN for delivery | existing | existing roles/CAS/refusal-only retry | synthetic stored states | U44-U45/U49; t18/t19 | human SOP + provider gate | operations lead |
| 79夥伴與內容 | 99d5b119 | N/A | existing | published-only; existing logo approval preserved | actual readonly approved R2 | U54; t20/t23 | all79 logo/relationship approval already present; URLs NULL | content owner |

## 精確 gate 與解除條件

| Gate | 未完成的具體證據 | 解除條件／負責人 |
|---|---|---|
| G1 完整測試 | current build/lint/typecheck/strings及private native5通過；actual current CI6346 pass/329 guarded skip、worker57 pass；exact99原collection單次332 pass/4 fail或timeout/162 genuine skip；597×200/3×429；兩個180秒長旅程在5000ms pacing下逾時，兩個與429同窗口失敗；原失敗保留 | Neon/Auth owner確認隔離quota scope/window/reset或專用驗收容量，之後按原collection/timeouts重跑；engineering核對每個skip及定向結果 |
| 身份 | U02-U06 Google/device、magic link、fresh no-profile | 人手測試裝置、approved test recipient、isolated Auth provider callback／identity operator |
| worker | Protected Preview 不能用 browser JWT 當服務憑證；dedicated config 只有 dry-run | 專用 service access、scope/secret transport 核對、雲端 source/APP_URL/readback、兩個實際排程窗口／worker operator |
| 通訊 | mock/stored-state/sink 不證明 accepted-timeout/STOP/實際通知 | approved test sender/recipient、real masked receipts、unknown first reconcile／communications operator |
| 業務 | D01–D06 無新增 association approval | 各 owner 提供有效政策/文案版本/責任與批准時間；只阻擋相關啟用 |
| 操作 | staff independent daily SOP（native media keyboard隔離已通過） | 協會 operator 依 operations-handbook.md 自行操作一次並簽實際結果 |
| 性能 | 3bc原門檻10-route Lighthouse全部通過（min .91/.96/1）；HK/SG/RUM/Production SLO | 匹配 source/data/network/region 的實測；不得把 TLS 稱 DB 慢／performance owner |
| 正式 | 本輪候選沒有正式批准；ledger/flags/provider unknown | 完成前項後，提交具體版本、能力、schema、worker、canary 發布批准／release owner |

## 順序及回退

按 `docs/integration/2026-10-01-hkwtia-remediation-release.md`：先 reviewed PR stack，確認目標／backup／ledger，0052→0053→0054→0055→0056 expand migrations，compatible web，scoped verified worker，至少兩真窗口；先無效果 UI，再私人匯出/資料修正，再匯入、finite grants、reviewed messages/票重發，小批 canary 各自核對，不能一次開全部 flags。

隔離已演練 baseline51→fault rollback51→rerun56、財務/indefinite 權益指紋不變、compatible 舊 app11實際讀取。這不是任意 Production 舊版或 cloud worker rollback。回退關閉該新 writer/排程、切 compatible app、保留 schema/新交易/audit/attempts/leases/outbox/CMS versions。0055 有 pending refunds 時，先 provider 對帳或用相容修正版，不能把 pending 清成 success。`RUN_LIVE_WOZTELL=0` 會採 mock 模式，不是安全 sender rollback；應 pause sender/inbox POST，保留 unknown receipts，禁止盲重試或新 attempt key。



## 最新程式驗證

595ae008只修復 owned Member360 CP950測試fixture為UTF-8：目標Chinese render1RED→2GREEN，產品組件不變。3bc4c136修復 native桌面 footer locale控制被Concierge遮擋，以及default-locale client redirect遺失fragment。四個雙語1280/390 native目標RED→GREEN，加上原無憑證journeys共8 pass；focused31 pass；build exit0。使用既有next-intl forcePrefix路徑與原middleware；無fragment與非default locale維持原client router，unsaved editor guard仍先執行。

最新6個named CI checks SUCCESS、Vercel READY；完整unit兩shards6346 pass/329 genuine guard skips，worker57 pass。原d87本機full6345/329與browser320/16/158、Auth40×429保留。當前browser harness在獨立run以2000ms或5000ms对確認隔離Auth host間隔後呼叫original fetch；不快取session、不略過provider/actor/limiter、不重試副作用。完整99 run確實執行，結果332 pass/4 fail或timeout/162 skip，不列完整通過。

Cloud worker automation service key仍未提供。來源已支持VERCEL_AUTOMATION_BYPASS_SECRET；browser protection cookie不可作worker服務憑證。

## 99d5測試互動準備及單次完整重跑

原3bc完整run331 pass/5 fail/162 genuine skip。四個Auth-dependent failure期間actual8×429，另一zh keyboard個案是在Header仍inert時focus。99d5等待non-inert/enabled後驗實focus再用nativeEnter，保留temporary-focus guard和原timeout。目標六個真provider個案重跑6 pass（37×200／0×429），無憑證keyboard8 pass；不能合併稱原完整run通過。exact99單次完整collection已完成：332 pass/4 fail或timeout/162 genuine skip，collectionErrors0。5000ms並未解除provider限額：600次get-session有3次429，無Retry-After；未暴露quota配置。兩個長旅程180秒timeout不擅自加長或拆測試。targeted original四例另外記錄；無source改動、不覆寫原失敗，也不合併聲稱完整綠燈。原門檻Lab10路由已過；不是正式SLO。


### 原條件定向驗證

Original四個失敗案例在exact99、2000ms、原180秒timeout、原完整role matrix及真provider下定向重跑4 pass/0 fail/0 skip；90×200/0×429。CMS62435ms、negative role95997ms、wizard28402ms、en TEST checkout11045ms。程式/斷言/timeouts沒有改動；原332/4/162仍保留，不能合併為單次完整綠燈。 證據：`evidence/t22/browser-99-targeted.json`、`browser-99-failure-disposition.json`；完整quota/readback gate仍在。

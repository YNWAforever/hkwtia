# 續會草稿與人工審批 SOP

## 狀態與前置条件

本輪工程使用既有 retention analyst、approval、durable work、AI budget、renewal batch 與 sender。真模型、雲端 worker 兩個實際排程窗口及正式啟用仍須各自驗收。`ADMIN_AI_RETENTION_DRAFTS_ENABLED=false` 預設停用；初始並行上限 3 是可配置工程限制，不是已批准協會政策。

啟用前先核對 app/worker SHA、0060 ledger、獨立服務身份、已批准 model/data/credential、每次/每日/每月預算及 provider receipt。不得重用 Auth secret。正式環境此次沒有 migration、發布或發送授權。

## 每日人工操作

1. 從「審批」檢查草稿的會籍參考、現有 plan、期間終止日期、facts version、原因及正文。沿用目前 system proposal 的職員共用審批，沒有自行改 ownership 或會籍政策。
2. 會籍、付款結果、公司席位或同意變更後，舊 facts 不可批准。頁面會提供可讀錯誤；重載最新資料並查明變更。過期草稿仍可拒絕，避免卡住歷史提案。
3. 「批准」只記錄人工決定，不會啟用會籍、收退款、發送或自動排程。需要續會提醒時，從獨立「續會批次」入口進入既有 communications 工作流，重新 preview、審批與 queue。
4. 真正發送仍走既有 server-side 權限、兩個 consent stores、已批准 template/locale、fresh facts、provider idempotency 及 outbox。AI 草稿不是新 sender，不能用新 request key 繞過 unknown。
5. 同一 facts/version 完成結果可重用；兩 worker 先取得 durable work，才呼叫 provider。候選以固定 asOf、每頁 100 筆 keyset 讀取；pending 在 SQL 批量判斷。沿用 active/past_due 與原有風險分支，不改 pricing、eligibility 或歷史 grants。

## Unknown 與停機

Provider 受理後超時、receipt 寫入或結果保存不明：維持 work/budget unknown，保留 receipt，交平台與財務先對帳；lease 或跨日不會自動退回預算或准許重跑。

停用新 retention capability，暫停相關 writer/dequeue；保留 manual workflow、audit、outbox 與歷史成果。回滾 app/worker 到相容版本，保留 0060 欄位/FK/index，不 drop 或刪除已批准歷史；修復採 forward migration。不要把 `RUN_LIVE_WOZTELL=0` 當真正停機旗標。

## 驗收界線

合成 offline 草稿可驗人工批准、拒絕、facts/CAS、鍵盤、手機與獨立批次入口；它不是模型成功、Google/magic-link 或實際 sender 收據。Loopback PostgreSQL 時間不是 HK/SG 效能證據。必需 provider、worker、身份與職員試用 gates 未齊前不可宣稱 full fix 或營運完成。

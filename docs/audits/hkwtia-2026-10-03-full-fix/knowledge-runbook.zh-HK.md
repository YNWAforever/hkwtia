# 核准知識來源：維護、驗收及回復（T07）

## 入口及職責

職員在 `/zh/admin/knowledge`（英文 `/admin/knowledge`）查看來源；每版本列出擁有人、核准者、生效／失效／覆核期限、取代版本、內容 SHA-256 及索引狀態。管理仍走原有後台 session 與 server actor。一般會員及匿名訪客不能進入。

1. 擁有人核對協會已核准原始文件，建立新版本；填寫來源網址、語言、公開／職員用途、香港日期、覆核期限、正文及已核實結構事實。期限及費用沒有自動政策預設。
2. 核准者先看完整正文、来源及 facts。`AI_KNOWLEDGE_APPROVAL_PROFILE_IDS` 必須由負責人明確指定；未配置就顯示可處理的配置提示。擁有人不能核准自己建立的版本。不同語言重疊有效期的 facts 不一致會拒絕核准。
3. 「核准」及「建立索引」是兩個動作。核准不呼叫模型、不發布 CMS、不發訊息、不批會籍。
4. 索引需要已批准的 provider 用途、獨立 credential、run/day/month 支出上限。缺配置在 claim／provider 前拒絕。外部接受後 timeout 保留 failed／對帳狀態；禁止按重試建立另一個未對帳请求。worker durable recovery 接 T11。
5. 撤回來源立即使它不再可搜尋；不復活舊版本，不刪除原文、hash 或 audit。核准新版本依明確生效時點結束上一版本，保留歷史日期查核能力。

## 檢索及草稿

沿用 `kb_documents` 與現有向量檢索。approved、ready、語言、用途、生效區間及覆核期限在排序／LIMIT 之前篩選。歷史資料預設 unverified／unindexed，不能把舊 metadata 誤當新核准。

citation 帶 sourceId/version/locale/audience/effective dates/contentHash。Unicode offsets 以字元而非 UTF-16 單位計算；資料庫核對原文 hash 與 chunk。`retrievalScore` 只表示相關程度，不能當準確度。

T07 已驗「來源仍有效嗎」；T08 尚須把它接到持久草稿 stale、最終正文事實檢查及 review CAS。真 embedding、真模型注入／錯金額驗收屬 provider/T13 gate。未通過前不啟用公開回答或行政 AI。

## 配置及發佈次序

- Production 維持原有 flags；`AI_KNOWLEDGE_MANAGEMENT_ENABLED` 預設 false。
- 相容 schema 順序：0057 budget → 0058 knowledge → 相容 web；worker 及 AI 另按能力矩陣驗收。
- 0058 是 existing table additive migration；保留舊來源並標 unverified，不刪 namespace 歷史。隔離 Neon 已由 ledger57 升至58；31個真 PostgreSQL測試另有填入歷史來源的 migration、SQL 約束、scope、CAS、timeout receipts。
- 本次 Preview 僅管理合成來源；provider／public AI／messaging／payments 等維持停用。核准者與 provider 配置及 operational acceptance 分開記錄。
- Production 0057／0058、正式來源核准與 capability 發佈須候選版本、測試、owner及明確授權；PR/main merge 不等於正式發布。

## 回復

停止新管理／索引／AI writer（相關 flag off），恢復人工流程。保留 schema、原文、版本、audit、index attempt、budget liability及 provider receipts。用相容 app 回退；不 DROP、撤銷歷史權益或把未知外部支出退款。對 failed/indexing 先核對 provider 接受紀錄與支出，再由經批准 recovery 流程處理，不能靠 TTL 自動解除。

## 本次證據

`evidence/t07/verification.json`、`neon-migrate-safe.json` 記錄207 focused與31實際PG pass；完整 gate／Preview 另以最新 receipt補充。原始 audit/UC 結果及 golden JSONL 保持原字節。只有 fixture 宣告完全相符的來源 ground truth citation ID 投影至新版本／hash identity；正文、status、business、注入／PII及副作用期待不變。這不是模型準確度成績。

# 收件匣建議稿與人工回覆 SOP

## 分清四個階段

工程已實作不代表已配置、正式已部署或已投入營運。AI generation 預設關閉；缺核准 provider、行政資料用途或完整 budget 時，直接人工跟進。合成離線草稿與模擬 provider receipt 不是外部模型成功。

## 日常操作

1. 在 `/zh/admin/inbox` 開啟既有 concierge 個案，核對會員、渠道、owner、期限、下一步與處理記錄。網頁對話仍不能被 WhatsApp takeover／composer 送出。
2. 有完整核准配置才可「準備覆核回覆稿」。server 只送出最近最多20筆訊息的角色／意圖代碼與最小 facts；電郵、電話、姓名、付款數字、日期、連結及附件正文不外傳。分類與摘要是建議，並非批准、退款或付款成功。
3. 在 `/zh/admin/ai-review` 按 owner、due、kind、state 篩選。讀正文、facts、source、成本狀態及前一版本。編輯會失去舊批准；每次覆核／採用都以目前角色、facts、source及 version CAS 重驗。
4. 多選只能覆核同 kind 的 proposed／needs_review 建議稿。逐筆結果可能是 saved、stale、invalid、forbidden 或 unavailable；不得把部分成功說成全部成功，也不直接群發。
5. 核准後返回對話，「採用到回覆框」只複製文字。已有人工回覆時先保留或清除，不自動覆蓋。再次讀正文，另按發送；現有 sender 重驗兩個同意 store、目前電話、時窗、範本、human handling、role 與 provider 冪等。
6. unknown provider outcome 不會自行重生或以另一 key 發送。交由個案 owner 用既有 receipt／對帳 SOP 處理；lease 到期與本地 TTL 不代表外部未成功。
7. 使用原有 owner／due／next action／handoff note、close／reopen 流程；不以 AI 改身份、會籍、金額、退款、發布或同意。

## 草稿保護

預設只在頁面記憶體持有回覆。舊明文 `wtia:inbox-draft:*` 一律丟棄，不再讀入另一登入。私有保留須 owner 明確配置 `INBOX_DRAFT_PROTECTION_ENABLED=true`、獨立 `INBOX_DRAFT_ENCRYPTION_SECRET`（不得重用 Auth／Concierge key）和 `INBOX_DRAFT_RETENTION_SECONDS`，60–3600秒；3600是可調工程上限，不是已批准的協會保留政策。

啟用後，browser 僅保存 AES-GCM opaque envelope，綁定 profile、Auth user、實際 session及對話。過期、竄改、另一身份／session／對話不能復原。清空輸入與成功發送清除該 envelope；unknown send 保留本文及原 attempt。成功登出清除本頁與 browser draft／attempt；登入新帳戶不讀舊草稿。storage、network或配置失效仍可人工輸入，但刷新可能丟失未保護文字。

## 配置與發布界線

人工操作不依賴 AI。`ADMIN_AI_DRAFTS_ENABLED` 僅控制 private review/adopt；生成另須 `AGENTS_ENABLED`、`ADMIN_AI_SUPPORT_DRAFTS_ENABLED`、`ADMIN_AI_SUPPORT_PROVIDER_APPROVED`、核准的 `ADMIN_AI_SUPPORT_MODEL`、該 provider credential及三項 budget。OpenCode 行政 adapter 維持 off。flags 不一次全開，依 T16 能力矩陣、兩staff／50cases daily／draft-only／一週及 owner 批准發布。

本任務沒有 migration；沿用 ledger59、existing ai_review_drafts／immutable revisions／reviews／work／budget／outbox。舊 `/admin/tasks?draft=...` 入口保留；新覆核頁是同一 repository 的篩選及人工多選介面。

回退先停新 AI work／新 private retention，保留所有 draft history、audit、receipt、unknown work。加密 key 輪替會使舊 envelope 無法復原；先通知職員人工保留未送文字。回退須採相容 app／worker，維持 T14D sender unknown safeguards，不能退回可盲重試的舊 sender。

## 尚待營運證據

核准模型實收 receipt／資料用途／spend cap、真 Google／magic-link、已 pin 的隔離 cloud worker兩窗口、真測試收件人 receipt、3–5職員及兩週基線／一週試點仍獨立待驗，不被 offline fixture、sink、skip 或本 SOP 關閉。

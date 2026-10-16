# 雙語報告及內容草稿 SOP（T12）

## 已驗證範圍

職員以現有授權身份開啟活動／新聞編輯器，來源為目前資料庫記錄。AI 只起草／翻譯正文。審批、複製、儲存及發布是分開的操作；價格、容量、日期、場地、報名方式、標題與發布設定均不會因複製而改動。會員 Writer 仍使用原有身份與 quota。

1. 儲存現有修改，再選英文或繁中草稿語言。配置不可用時繼續人工編輯。
2. 在草稿審核頁對照受控 facts、來源、正文、版本及驗證結果。缺資料、政策或 provider 核准時交負責人確認。
3. 按審批後等候畫面確認狀態。返回內容編輯器，按「複製已核准正文」。此步只更新未儲存的指定語言文字欄。
4. 用原有私有預覽檢視英文及中文。儲存／發布仍經現有權限、CAS 與 audit；AI 不自動發布。
5. 來源 facts、職員權限或草稿版本變更時重新起稿及審批。複製期間又有手動修改時保留手動修改。
6. 報告 KPI 由資料庫及既有公式產生；零分母顯示未有資料，無比較期不聲稱改善。中英文摘要獨立驗證及安全呈現。歷史報告保留原內容，缺中文時有明示提示。

## 配置、發布及回退

所有新 capability 預設關閉。0061 只新增既有 durable work 的 restricted post FK／CHECK；0057–0061 ledger 必須先準備，才啟用任何會用新版 work repository 的 generation。不存在核准的行政模型、資料用途、測試憑證及實際 cost caps 時，不啟用 provider。Engineering 的值不是協會政策。

- 先核對隔離 DB/Auth、ledger、來源 SHA、Preview positive marker、app/worker bindings、actor、批准 provider 與預算。
- `ADMIN_AI_BOARD_DRAFTS_ENABLED` 控制排程報告；`ADMIN_AI_CONTENT_DRAFTS_ENABLED` 控制職員內容介面；內容 provider 另需 `ADMIN_AI_CONTENT_PROVIDER_APPROVED`。仍需全域 drafts/agents、現有 model registry 及 budget 限制。
- 本次 Preview 容許審批／複製合成 offline proposals；agents/provider 關閉，並非真模型、真人職員試點、Google 或 magic-link 驗收。
- 回退先停新 generation／dequeue，關閉新 flags。若退回不識別新 flags 的舊 app，先關閉 `AGENTS_ENABLED`，保留人工主流程。保留 schema、history、audit、budget、claims、receipt；不 DROP 新資料。
- provider 已 accepted 或結果 unknown 時先核實，不以 lease／TTL 到期退款或重跑。配置／部署與 operational 狀態分開記錄。

## 每日維護

核對未審批草稿、stale／unknown、quota／預算與未驗證成本、job readiness 及人手後備流程。報告顯示來源期間與起草 run；不要以英文正文冒充已翻譯。按 T13 與 T16 核准資料及兩位 reviewer 的評測結果，才開始兩名職員／每日最多 50 宗／draft-only 一週試點。未知 worker 窗口不代表全部故障。正式版本、遷移及功能启用需對應具體授權。

# AI 草稿覆核操作及回退（T08）

狀態：工程驗證及隔離 Neon ledger59 通過；本次完整 CI、native Preview、真模型及業務串接仍各自驗收。正式環境沒有套用0059或啟用新能力。

## 職員操作

1. 從現有「今日工作／工作項目」進入草稿列表；正常人工跟進仍使用原工作表格。
2. 開草稿後核對種類、案件、負責人、期限、版本、facts hash、來源版本及有效期、模型／prompt版本。成本未知顯示未核實，不能把0視為免費。
3. 核對「目前 facts」、「最後已驗證正文」及前一版本的已保存正文；前文不會按新facts重算。來源無法讀取時保留歷史內容供參考，禁止批准。
4. 草稿出現金額、日期或權益等關鍵facts時，用應用提供的整個facts欄位；不要自行改成其他金額／日期或加入HTML／MDX／外部連結。校驗失敗的草稿不能批准。
5. 修改正文後儲存會增加version、重新校驗並清除舊批准。未儲存改動受既有離頁提示保護。
6. 批准或拒絕只保存覆核紀錄，不發送、不發布、不更改會籍或付款。發送／採用仍須走原業務服務及當時權限、同意、窗口和政策檢查。
7. 另一職員先處理同一版本時，重新讀案件和草稿；不要重覆提交舊版本。facts／來源變更會使舊批准stale，需新稿及新覆核。
8. 外部請求已開始而結果未知時，保留unknown和原回執；由服務負責人對帳。lease／TTL過期不是退款或重新請求的批准。

目前T08只註冊既有staff task的最小facts reader。申請、收件匣、續會、董事會及內容生成在T09–T12各自接入；空列表及manual fallback不能當作模型生成成功。

## 配置與發布順序

- 現有D01–D06不變；新增工程預設不代表協會政策。先取得核准provider／資料用途／費用上限、來源及資料保留責任人決策。
- 先0057預算、0058知識版本，再0059草稿與durable work；舊web/worker可繼續使用原表。
- 確認DB/Auth/worker/provider隔離：非primary/default/protected、精確hostname摘要、synthetic sentinel、ledger、保留原資料域檢查。Preview名稱不是隔離證据。
- 部署相容web；`ADMIN_AI_DRAFTS_ENABLED=false`仍可操作原今日工作，且不查新草稿表。只在已核實隔離Preview開啟review能力；`AGENTS_ENABLED=false`和provider caps0不產生模型請求。
- 生成與採用能力須另經T09–T13/T14業務驗收。職員兩人／每日50cases／draft-only一週試點是T16的受控发布範圍，不在本task自動啟用。
- 原Production基準及目前部署須在最後發布前重新讀；沒有具體版本授權不能把main merge當正式已發布。

## 回退／故障處理

1. 關閉新生成及`ADMIN_AI_DRAFTS_ENABLED`，禁止新的採用／provider request；保留人工工作及查閱已存在audit的流程。
2. 以相容的先前web/worker版本回退；不DROP新表、不刪revisions/reviews、不撤銷歷史membership grants或已付款權益。
3. 已requesting／unknown的work及budget liability留待原provider回執對帳；不能以新key重跑或TTL解除費用。
4. 任何資料保留／遮罩／修復須由資料責任人批准獨立forward repair；append-only歷史是工程證據預設，不批准永久保留個人資料。
5. 保存非敏感版本、錯誤碼、stage和receipt；不要保存會員對話、email、cookie、登入token、付款keys或全份環境內容。

## 本次可重現命令

- `node node_modules/vitest/vitest.mjs run tests/unit/ai-draft-validation.test.ts tests/unit/ai-concierge-grounding.test.ts tests/unit/ai-draft-actions.test.ts tests/unit/ai-draft-work-boundary.test.ts tests/unit/ai-review-panel.test.tsx --maxWorkers=1`
- `RUN_POSTGRES_INTEGRATION=1 node node_modules/vitest/vitest.mjs run tests/integration/ai-draft-review.test.ts --maxWorkers=1`（POSIX寫法；PowerShell先設定Env，再移除；fixture僅自己的loopback PostgreSQL16）。
- `npm run lint`、`npm run typecheck`、`npm run audit:strings`、`npm run build`；完整unit suite另按exact-source CI記pass/skip，不把skip算pass。

詳細RED、原始log摘要hash、固定22/28/64台帳及隔離0059 receipt見`evidence/t08/verification.json`。原始audit／UC結果與25題golden JSONL字節保持不變。

## T08 本次驗收版本

`9cfb70de`：CI6567pass／416skip，worker57pass及全部checks綠；真正隔離Preview以合成Neon密碼身份完成17入口＋12草稿checks。手機按鈕42px的RED已修至44px。Preview來源部署`dpl_6ugvMLSDGzYUNofZ39VDBKgu7yCa`。本次沒有真模型、Google、magic link、付款或訊息效果；0059只在隔離資料庫。完整task及case尚有獨立gate，並非fullfix。

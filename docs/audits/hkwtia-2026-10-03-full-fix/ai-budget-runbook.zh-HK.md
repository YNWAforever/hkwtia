# T06：AI 預算、成本對帳及回復

## 實作與配置界線

所有既有 runtime、背景評測、judge 和實際 embeddings 都先走同一整數 micro-USD 帳本。每 run／UTC 日／UTC 月的 admission 由同一 transaction 與 advisory lock 保護；JSON 整數必須安全且非負。缺少有效配置就拒絕 provider；人工流程仍可操作。

`AI_BUDGET_RUN_MICROUSD`、`AI_BUDGET_DAY_MICROUSD`、`AI_BUDGET_MONTH_MICROUSD` 必須由財務／服務 owner 核定。`.env.example` 只列空白名稱；測試中的合成 cap 不是協會支出政策，不會自動写入正式環境。

最多八個已限制輸入／輸出的 step、SDK 重試零次，按最昂貴允許的輸入費率預留。輸入採保守 UTF-8 bytes 邊界，未宣稱精確 tokenizer。工具結果在每個 step 同樣受限。互動等待上限20秒；concierge／support／renewal初始800，application／Writer1200，board／content1600 output tokens。這些是工程初值，後續 T13 調整要附新證據。

## Known、unknown 與對帳

1. reserve 成功後，先持久化 dispatch CAS 再開始 HTTP。相同 runKey 不會建立第二份預留；只允許一個 dispatch。
2. HTTP 200 的 provider request ID 在讀 body 前入帳；僅存經格式檢查的 ID 和時間，不存 headers、來源正文、keys。
3. aggregate usage 保留 SDK7 `result.usage`；cache read/write 是 input 的子集，reasoning 已包括在 output，不能再扣一次。已知成本以 BigInt 固定小數計算，六位 USD 等同一 micro-USD 的最近整數；小於半 micro 的已知成本可四捨五入為零，仍標 known。預留一律向上取整。
4. 無 usage、取消、partial output、accepted-timeout 仍保留 unknown／held 的最大 liability。expiry 只是停止開始新 request 的期限，**不是退款依據**；未解決的舊期間 liability 也佔用新期間 cap。
5. 只在證明尚未 dispatch 時 release。遲來 known receipt 可更新帳務，failed run 不變成成功，不重新發送。若 ledger 寫入失败，保留 hold，不宣稱完成或免費。
6. actual 大於預留仍完整記帳，原子設置 halted／`actual_exceeds_reservation`，停止新 AI 工作。財務／服務 owner 先核對 provider receipt 與上限；不得截斷金額或只憑 TTL 清除。

Agent run 的新 `cost_microusd` 能完整存安全整數；舊 decimal 欄只保留相容 mirror，超過其範圍時 mirror=NULL。舊歷史成本及權益不重算。Public AI-Ops 有未解決用量時顯示「資料不足」，不以US$0冒充未知；已知 ledger 與舊 run 避免重複合計。帳務月份用UTC，營運報告沿用Asia/Hong_Kong，兩者不可直接混作ROI。

## 官方價格快照

2026-10-03 核對 [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)、[Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing)、[prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)、[text-embedding-3-small](https://developers.openai.com/api/docs/models/text-embedding-3-small)。新記錄使用 `verified-2026-10-03`。既有普通 input／output 價格保留；新增官方 cached-input、標準5分鐘cache-write、embedding價格。沒有啟用1小時cache、Batch、residency surcharge、其他模型或Go行政adapter。這是價格契約核對，並非真 provider 帳單驗收。

## 已執行的遷移及演練

- Disposable pgvector／PostgreSQL16：16項實際 repository／交易測試通過，包括20 concurrent、四agent／Writer quota、unknown TTL、超支停止、0057從填有歷史資料的0056向前套用，以及停新AI時帳本保留。
- 確認隔離的Neon `br-lingering-unit-azxl75s5`：`npm run db:migrate` exit0，ledger56→57；5932個保留測試域profile數量不變，零外部provider請求／新增fixtures。原T05的ledger56證據仍保留為歷史run。
- 正式DB沒有執行0057。13:57UTC正式版本仍為36ebae1／dpl_9jPwBRj3Cy5Wcan9N76mgRRXKkvN。

## 發布順序與回復

1. 關閉新AI生成／排程／採用，sender與付款flags按原批准界線維持。
2. 正式schema只有具體遷移批准後才套用0057；備份及記錄 ledger hash。0057是additive，不刪歷史。
3. 發布相容web／worker，核對source、ledger、獨立service身份與budget caps；先驗readiness／人工fallback，再按能力跑provider receipts。
4. 真provider、知識與facts／review驗收、D01–D06及T16發布門檻完成後，才可核准2staff／50cases/day／draft-only試點一週。
5. 回復先停新AI工作，用保留unknown顯示及帳本相容性的app版本；0057帳本保留，待對帳。不得down migration刪帳本，也不能把舊版未知成本顯示為零後當作完整回復。現有演練證明的是相容程式停用生成／保留ledger；沒有聲稱正式promotion或跨版本Production演練。

## 仍待證據

完整gate：6490 pass／355 skip；267 focused pass／1 guarded skip，16 actual PG pass／0 skip，lint（0 errors／82既有warnings）、typecheck、strings（311 TSX）、build exit0。真provider receipts、owner支出上限、Preview候選部署驗收、正式遷移／能力發布與營運試點尚未通過。Google／magic-link、worker兩窗口、sender／Stripe TEST等獨立門檻仍分項追蹤。本任務不宣稱full fix。

# 首批修正：能力發布及回復單

## 已驗證程式

- T01：缺配置的安全 503、保留問題、可用人工入會／聯絡入口、手機及鍵盤恢復。
- T02：17 工作的原因碼和未知計數；空已驗證 receipt 的零值與沒觀察資料分開。
- T14A：應用個案／inbox scope 的登入返回路徑，頁面與 server actor 邊界保留。
- T04：audit 工時、固定人工比較組、樣本差額與未知值。完整非客服分母、真實兩星期基線仍待完成。
- T03：既有八操作的固定 scope／CAS／effect key、50／500／5000 及固定100筆回歸；沒有開正式 flags。

程式 runtime `2c992618c5c737b98d911c086195db312a21de6f`；batch 測試提交 `f73f66316836dea53193dc8aaf2a710d278afa39`。本單不宣稱 full fix、Google／magic-link 成功、worker 雲端兩窗口成功或正式發布。

## Preview 順序

1. 確認 linked project hkwtia、feature branch codex/full-fix-20261003、隔離 DB/Auth；先設定 branch-scoped TEST credentials、獨立 concierge／service secret、closed flags、APP_URL。
2. 推送可審核 source；記錄 Git SHA、deployment ID、target Preview、READY 及 ledger56。只驗 target 為 Preview，正式 alias 不移動。
3. 原有 default Preview 可能用 primary DB，不能憑 Preview 標籤判斷隔離。用本輪唯一合成記錄對照實際 app 讀取，並保存只有布林／摘要的證據。
4. 認證驗收另需該隔離 Auth 分支信任精確 Preview origin；真 Google 與 magic-link 仍需受控測試帳戶、准許收件人及 provider receipt。
5. 做匿名／member／staff／superadmin actor 邊界、中英及390px、T01 fallback、worker health、T04計時和固定比較組。測試清理只針對本輪 owned IDs。

## 正式 capability 矩陣

| 能力 | Code | Configured | Deployed | Operational / gate |
|---|---|---|---|---|
| Concierge failure recovery | Verified | Preview agents off / independent secret | Formal not released | Approved configured provider-success receipt and Production secret verification pending |
| Worker health / jobs | Verified read model | Isolated worker binding pending | Formal not released | Every enabled job requires pinned version and two actual windows |
| Admin login continuation | Verified | Isolated Auth exists | Formal not released | Real Google / magic-link valid, expired, replay and cross-device receipts pending |
| Administrative timing | Verified | No provider or migration needed | Formal not released | Actual two-week baseline / agreed scope; no ROI claim |
| Eight bulk operations | Actual SQL regression verified | Preview flags off | Formal flags unchanged | Operation-specific worker / approval / provider readiness before enablement |

Fresh project metadata reports Production Git branch `release`。本 session 的 code merge 授權可用於 main；不把 main merge 當作本候選能力的正式發布批准。正式 alias 的基線為 `dpl_9jPwBRj3Cy5Wcan9N76mgRRXKkvN`／`36ebae1`；發布前需重新核對其最新狀態。

## Migration / web / worker / flags 順序

本首批修正沒有 migration，也不需 seed。只重用既有 audit_events 和 ledger56。先保持新 writer/dequeue closed，發布相容 web／worker；核對 APP_URL、service credential、實際 ledger、Git revision 及 receipt。先逐項確認 operation，再按 T16 已獲授權能力開旗；不能一次開所有 AI／batch／sender flags。AI 試點仍為2 staff／50cases/day／draft-only一星期，需另外完成其餘任務與營運門檻。

## 回復及停用

- Preview：保留 deployment identity 和既有 isolated history；切回上一個已驗證 Preview，或停止本輪測試服務。
- 正式：只有具體能力發布批准後才執行 promotion；批准單須列已驗證 SHA／deployment、環境差異、rollback ID。
- 停新增相關 writer/dequeue，保留 in-flight、approval、audit、batch snapshot及effect key。unknown 外部效果先對帳，不重送、不退款、不因 TTL 到期撤銷權益。
- 本首批沒有 schema 回退；回退相容 app 可保留新 audit metadata。計時或比較組不修改會員政策、grant、payment、身份、consent 或 CMS publication。

## 未完成工程及門檻

其餘 T05–T18 仍按 dependency 繼續。T04 的非客服完整分母也是工程待辦，不冒充 provider／policy 阻礙。T16 正式批准與真實人手樣本為營運門檻；真 Google／magic-link、配置後 AI 成功、cloud worker windows、Stripe TEST 和 sender receipt 仍須各自驗證。

## T17 內容維護候選（2026-10-04）

此增量无 migration；T17源碼9f657c93／Preview73272cc6。DB/Auth已正向證明隔離，ledger59；CMS旗只在T17 Preview啟用，Production配置未變。真CMS儲存／私有預覽／另一裝置／CAS衝突／鍵盤發布／私有還原→再發布及history已驗，原始公開內容由 audited publication 還原。公司 media封存與更新兩修正一起發布／回退，防止其中一半失去競爭保護。

| 能力 | Code | Configured | Deployed | Operational / gate |
|---|---|---|---|---|
| CMS private draft/publish/history | Existing architecture retained; actual PG/native regression | Only isolated Preview CMS flag true; ledger59 | T17 Preview, not Production | Source claims/branding/policy owner signoff and G5staff pilot pending |
| Company logo archive/attachment race | Paired transactional fix; actual target RED/mutation/GREEN | No new env/flag/schema | T17 Preview, not Production | Existing review policy retained; no cleanup/publication of real company records |
| Public route/demo/metric semantics | Actual EN/HK paths, private/demo excluded and distinct counts | Current approved/stored data only | T17 Preview | 79logo authorization retained; URLs/translation/legal facts require their own signoff |

本輪 main merge 不等於正式發版。發布邊界待T16具體版本、capability、現有migration0057–0059及service/provider差異單；Production branch仍release，以 `evidence/t17/production-readonly.json` 的新讀值為準。回退相容web/source，保留資料、audit、grant、published history和in-flight效果；不逆刪0057–0059。


## T14C capability 發布／回復單

| 能力 | Code | Configured | Deployed | Operational |
|---|---|---|---|---|
| Locked payment receipt/correlated expiry | RED/mutation→PG verified | Existing HKD/full-refund policy preserved | Isolated Preview fe92e533/dpl_H48GCDUfEmB8n97VsgBoNPQArbwN | Hosted Stripe TEST9, controlled signed CLI12; automatic remote delivery pending |
| Expired recovery cookie | Provider-read-confirmed only; native same-browser verified | Existing Stripe TEST/isolated Auth | Same Preview; Production unchanged | Real Google/magic and full worker/G5 gates pending |
| Ticket/refund notice | Existing durable outbox | Isolated test sink only | Actual local built app | Real recipient receipt not verified; no live-send authority |

T14C沒有migration，目前隔離ledger59。Production仍需獨立批准0057–0059／新能力，不能因main合併推斷已發布。先核對ledger相容性與web/worker的APP_URL/service credential/version，再按具體批准發布web；worker本增量無需改變，保持新AI／sender／bulk flags closed。Stripe webhook保持既有簽名secret與idempotency，不改Production provider配置。

回退T14C相容web至base e12add4e或上一個已驗證版本，保留資料庫訂單、grant、provider退款及不可變audit/outbox；不逆刪schema、不嘗試撤回真實已發生退款。先停新增effect/dequeue，再按providerreceipt逐筆對帳。T16仍需真實發布與回復演練、批准candidate/rollback deployment和每個啟用能力的cloud窗口。


## T14D sender capability 發布／回復单

程式source9603519已在隔離Preview，SQL48/native6/Preview17與完整6657pass519skip0fail已核對；無migration。Production、real-provider配置與G5仍未發布／驗證。

先核對web/worker/ledger及目前in-flight效果，再由具體T16批准單選擇能力。Production首次仍需0057–0059相容性與獨立批准；本task不能默認開sender/AI/bulk。保留原key、audit/outbox/provider receipts。

舊版可能重試未知效果，故持續發送時不應整體回退至unsafe sender程式。若需回復，先暫停所有相關人工及worker發送入口，再部署相容guard或forward repair，逐筆對帳後才恢復。單獨關閉bulk flag不能暫停人工補發。不得刪資料或用TTL當已退款／未發送證據。T16真實回復演練仍待完成。

## T10 private review／protected compose 发布界线

PR136 无migration，沿用ledger59。当前CI/full/native已绿灯，Preview final receipt另读evidence/t10/preview-runtime.json；AI模型／cloud worker／人員試點仍獨立待驗，不得稱full fix。

1. 維持 sender 與新AI work pause；核對 pinned app／worker／ledger／provider／flags，每能力單獨批准。
2. 只先部署相容程式；private review、support generation與protected retention為不同 flags。未批准行政資料用途、model route、caps或保留政策時，各相關能力保持 off。
3. 保留目前人工流程與T14D unknown safeguards；browser key獨立於Auth／Concierge。Key輪替會失去舊 envelope 的恢復能力，需職員先人工保留未送文字。
4. 回退先關新生成／新私有保留，保留draft/work/budget/audit/unknown與既有outbox，使用相容app／worker；不刪history，不以TTL解除budget/providerunknown。不回退至舊可盲重試sender。
5. 精確Production版本／範圍／0057–59／flags與T16實際回復演練、provider receipts／worker兩窗口仍為最後發布單門檻；本PR合併不切Production。

## T11 續會草稿能力發布順序

1. 確認指定 DB/Auth 隔離與 app/worker SHA；核對 migration0057→0058→0059→0060 ledger，不以 Preview 名稱推定隔離。
2. 0060 先於使用 approval result 的 app/worker 上線；它只增加 approval FK/result CHECK/pending index，不能重跑生成器的大範圍歷史差異 SQL。
3. 保持 AGENTS_ENABLED/ADMIN_AI_RETENTION_DRAFTS_ENABLED/send flags 停用。核准 route/data/credential/run-day-month caps、獨立服務身份與 concurrency 上限，再驗 receipt/unknown/manual review。
4. 真實兩個 worker 排程窗口及 T13/T15 gates 通過後，按具體能力授權作 T16 2staff/50cases/day/draft-only 試點。此次未執行正式發布。
5. 回滾停新工作、相容 app/worker；保留0060與歷史結果/unknown/budget/audit/outbox，不 drop、不盲重試、不把 TTL 當退款。人工續會及 sender 保持獨立。

操作詳見 [續會草稿 SOP](retention-draft-sop.zh-HK.md)。

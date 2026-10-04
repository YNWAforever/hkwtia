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

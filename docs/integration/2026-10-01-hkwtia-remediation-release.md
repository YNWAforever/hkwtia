# HKWTIA 2026-10-01 發布與回退執行單

候選版本；本輪正式發布尚未批准。開發、合成資料隔離驗收及 Vercel Preview 憑證配置已獲授權。原 PR105、79 標誌、R2、0037–0051 批准不適用於本輪新版本、0052–0056、政策或全部 flags。

## 審閱順序與發布前檢查

PR107 T00–04 →108 T05–07 →109 T08 →110 T09 →111 T10 →112 T11 →113 T12 →114 T13–14 →115 T15 →116 T16 →117 T17 →118 T18 →119 T19 →120 T20 →121 T21 →122 T22–23。各 PR base 是前一 feature branch；順序審閱、核對最新 main，保留其他工作。

當前版本與 gate 見 [發布矩陣](../audits/hkwtia-2026-10-01-remediation/release-readiness.md)、[正式只讀核對](../audits/hkwtia-2026-10-01-remediation/production-readback.md)、acceptance.csv、各項 evidence。PR／建置成功不是 provider 或正式验收。

- [ ] 指定 source／deployment、worker source／version／APP_URL、操作人、批准時間、canary 範圍、回退版本與負責人。
- [ ] 適用 UAT、全 suite 及 failure／skip 處置完成；Google、mail／WhatsApp、unknown-effect、獨立職員 SOP 缺證據不得簽 full fix。
- [ ] D01–D06、雙語 content signoff、sender／允許測試收件人和政策 registry 版本由業務 owner 簽署。合成政策不能當批准。
- [ ] 正式 ledger／flags／provider account、mode、sender 只讀核對；未知不能當 false／正確。
- [ ] 完成目標相容性／migration／rollback rehearsal，停止受影響舊 writer，保留 history、audit、outbox、lease、attempt key、provider ledger。現有演練不代表任意 Production 舊 app／cloud worker 相容。

## 0054 相容性及 migration 鎖定前置檢查

先由已批准的目標只讀執行 `docs/audits/hkwtia-2026-10-01-remediation/evidence/t23/migration-preflight.sql`，只保存read-only boolean及aggregate counts，不記會員ID或原key。查詢與0054正規化規則完全相同；schema51/56皆可執行。既有隔離receipt `evidence/t12/migration-compatibility.json` 為 duplicateGroupsBefore0／ledger53→54／membership fingerprint不變；不是正式資料證據。最新exact99只讀實跑同一SQL，readOnly=true／duplicateGroups0／pendingRefundOrders0，見`evidence/t23/migration-preflight-isolated.json`；仍未核對正式。

- `conflicting_renewal_episode_groups` 必須0。若非0，停止0054，交技術＋會員owner核對原episode與external-effect receipts，再提交單獨可審處置；不刪history、不解除去重、不自動重寫key或重發。
- `pending_refund_orders` 只表示0055狀態機目前筆數，不是provider結果。舊app回退前須核對所有pending financial receipts與reader相容性，未知先對帳。
- 0053/0054是普通transaction內CREATE INDEX，不假稱CONCURRENTLY；先停止相關writers/claims，估算資料規模與鎖等待，批准maintenance window及lock/statement timeout後才執行。不得在正式先試fixture或直接改已套用SQL。

## Migration → web → worker → flags

1. 明確批准目標及版本後，暫停受影響新 writes／claims／sender。只對該目標執行實際 repository migration runner；不 seed、cleanup、撤銷歷史 grant 或改付款狀態。
2. 讀回 ledger：0052 verified_worker_health、0053 bounded_renewal_window、0054 renewal_episode_compatibility、0055 ticket_refund_pending、0056 page_copy_private_drafts；最後 journal idx56。不能重播已套用的手寫 SQL。
3. 部署相容 web／webhook reader，核對 alias／source、private cache、匿名和各角色 smoke；新 flags 關閉。
4. 部署 reviewed worker，核對 source／version／APP_URL、job allowlist、CRON secret 與 health revision；觀察兩個真正 scheduled windows。HTTP200、disabled、未知版本不是 settled success。
5. 分批 canary：無副作用 UI →核對 health →限定資料修正／私人匯出 →匯入 →有限 grant →reviewed 通訊／票重發。每項記精確 scope、actor、counter、receipt、provider 與 read-after-write；不 blanket enable。
6. 記錄每能力啟用前後 app／worker／ledger／flags／provider、批准時間及 owner，確認異常才擴大。

## Runtime 控制

| 能力 | Runtime 控制 | 啟用 owner／證據 |
|---|---|---|
| 批次 | ADMIN_BATCH_ENABLED | 營運；八種操作、50／500／5000、scope／CAS／lease／取消／部分失敗／unknown-effect |
| 匯入 | MEMBER_IMPORT_ENABLED | 會員／資料；review、TTL、version、允許測試收件人 |
| 私人匯出 | MEMBER_EXPORT_ENABLED、EVENT_ATTENDEE_EXPORT_ENABLED | 資料／活動；授權 scope、私人附件、TTL |
| 特別會籍 | MEMBERSHIP_GRANTS_ENABLED、MEMBERSHIP_GRANT_BATCH_ENABLED、MEMBERSHIP_COMPANY_GRANTS_ENABLED | 治理；有限期限、理由、actor、approved snapshot；公司政策獨立；保留歷史權益 |
| 通訊／票重發 | MEMBER_COMMUNICATION_BATCH_ENABLED、TICKET_RESEND_BATCH_ENABLED | 通訊／活動／財務；兩處 consent、STOP、獨立 reviewer、原 key、provider receipt |
| 政策 | MEMBERSHIP_POLICY_ACCEPTANCE_ENABLED、MEMBERSHIP_POLICY_ACTIVE_VERSION | 會員／財務；唯一 registry 內已批准雙語版本 |
| 付款對帳 | PAYMENT_RECONCILIATION_ENABLED | 財務／技術；原交易、test receipt、CAS／重播；不能用 comp 修補 |
| CMS 私人草稿 | CMS_SERVER_DRAFTS_ENABLED | 內容／技術；0056、actor／revision、CAS、發布／回復、退役舊 direct writer |
| Worker | WORKER_HEALTH_REVISION、WORKER_HEALTH_JOBS、WORKER_JOB_ALLOWLIST | 技術；真正 source／target／scope、兩個 scheduled windows、安全 provider mode |

Flag 關閉阻止新請求／claim／一般 retry；保留歷史讀取及已被 provider 接收效果的安全 settlement／對帳。Unknown 不能 ordinary retry。

## 回退

1. 先停相關新 writer／claim／sender；記錄尚在處理的 attempt、provider reference、lease、退款，未知先對帳。
2. 切回事先核對的相容 deployment／worker；保留新 schema／交易，讀回 alias／version／scope，重跑無副作用 smoke 與 financial/history fingerprints。
3. 0052 可停 observation，0053 index 留存，0054 legacy／normalized uniqueness 留存；不能刪 ledger 或移除去重以重發。
4. 0055 enum 不做普通 down-delete。舊 reader 回退前須 pending-count0 且 provider 全對帳；否則用相容 corrective app、暫停 refund writer。不把 pending 改成 paid／refunded。
5. 0056 保留 drafts／revision sequence／published copy／history，停新 writer，不能恢復繞過 CAS 的舊 direct writer。內容回復建立新發布紀錄。
6. T15 舊 prepared import digest：cancel 未開始行並重作 preview，completed 保留。T19 停舊 inbox POST／sender，保留 owner／version／attempt；不刪 lease、換 key 或 mock 標 sent。

回退不能撤銷已發送訊息、已扣款、退款或服務商接收。

## 尚欠外部條件

| Gate | 解除條件 | Owner |
|---|---|---|
| Auth | 隔離人手 Google/device callback；允許測試收件人的 magic-link expired／replay／collision／no-profile receipts | Identity operator |
| Mail／WhatsApp | approved sender／recipient／template，actual delivery 或 accepted-timeout reconciliation receipt | Communications/provider operator |
| Cloud worker | 專用隔離 target、scoped secrets、Protected Preview 的服務對服務 automation access；不得把 browser JWT 存到 worker；部署後兩個真正窗口 | Technical release owner |
| 政策／內容 | D01–D06、版本／引用／批准時間；缺夥伴 destination 由 content owner 提供已批准 URL，不編造 | Association owners |
| 維護／效能 | 職員獨立依繁中 SOP 完成一次；native media keyboard已於隔離驗證，HK／SG vantage、RUM p75／SLO仍待證據 | Operations/performance owner |
| 正式發布 | 全適用 gate 過後批准具體 source、migration、worker、flags、canary 與回退人 | Release owner |

分開「程式已修／隔離已驗／Preview 已部署／正式已部署／正式已啟用／正式已驗證」。尚欠門檻不得合寫成 full fix 完成。


## 2026-10-03 合併狀態更新

原 remediation PR107–123 已合併，main code `a1ab9331` 的 CI 實際綠燈（6346 unit pass／329 genuine skips；57 worker pass）。app/worker/schema/test byte-equivalent4747；依賴 scope 修正不會改政策。Production branch 仍是 `release`，正式部署 readback仍e7fa4add。發佈來源以具體批准 SHA 為準，不能由 main merge 推定 Production 已发布。最新候選矩陣、實際隔離 Preview、失敗及 gates 在 audits 的 release-readiness.md；0052–0056 和新 flags 仍需本次正式批准。正式只讀預檢只需要 owner 核實 project/branch/host，不需要匯出全部正式 secrets。


### Preview 運行時設定核對

本輪 CLI Preview 雖含正確 gitCommitRef/gitCommitSha 且 buildREADY，實際 posts read42P01；保留失敗，沒有補 primary schema。改用同分支與同33個設定的 Git-source deployment 後，唯一G0 marker200、真Auth三角色及原17個smoke通過。之後Preview應用Git-source構建，查 deploymentId/source/target，並用隔離owned marker正向證明DB後才開始具效果驗收；不能由metadata推測DB。main預設Preview指向primary，禁止fixtures。現有驗收alias被明確指向dpl_HEigQwRm3nqjbbooL6uKSScjucTG，不影響正式alias。

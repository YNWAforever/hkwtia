# 發布狀態：首組 T00–T04

本頁只描述首組修正；完整修正及正式發布尚未完成。

| 項目 | 已取得證據 | 尚待門檻 |
|---|---|---|
| T01 中文字串 | 33 值、CLI 反例、中英瀏覽器 | Preview／正式 readback |
| T02 選取能力 | 共用 server guard、停用／部分開放／會員拒絕 | app／worker／flags 發布矩陣 |
| T03 分頁 | 51 focused、51/101 真 SQL、2 Chromium | Preview／正式 readback |
| T04 草稿復原 | 29 focused、4 Chromium、既有 CAS 真 PG16 | T17 server draft／並發發布 U48 |
| 新 migration | 本組沒有新增；隔離 ledger 51 | 後續任務新增時另行列出 |
| 正式 app | e7fa4add，dpl_GYj8pTrvHxSZRDszXnVnCtkDS8rV | 本輪候選版本尚未發布 |
| 舊 worker | July version 已讀回；APP_URL/SHA 無法證實 | T11 專用隔離 worker 驗收 |
| Google／magic link | 現有程式保留；合成密碼登入可用 | 專用測試收件人及人手 provider 登入 |

## 本組 rollout／rollback

1. 審閱第一組 PR；確認 Preview DB/Auth 指向已核對的隔離 branch，Stripe 為 test mode，訊息為 test sink／合成允許收件人。
2. 部署 app Preview，重跑本組中英／手機／權限案例；未證實來源及效果的既有 worker 不用於驗收。
3. 本組不要求 migration、worker 更新或正式旗標開啟。T02 只忠實顯示既有 server 能力。批次啟用仍依 T11/T14/T23 web／worker／ledger／flags 順序。
4. 正式發布須先完成整體發布單及具體版本授權。本組目前只開發／隔離驗收／供審閱。
5. 如本組 app 發布失敗，可切回目前正式 deployment；本組不改 schema、價格、退款、consent、歷史 grant 或 79 個已發布標誌。不得以回滾為名清資料或重新付款／送訊息。

後續 T05–T23 會擴充此矩陣及完整 rollout／rollback 演練。

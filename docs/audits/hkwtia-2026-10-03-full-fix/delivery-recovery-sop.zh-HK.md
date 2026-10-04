# T14D 通訊及門票補發復原 SOP

## 日常入口及狀態

1. 在工作台打開 inbox／相關會員或活動的 attendee list。保留原 conversation、通知、batch item、provider ID 及 attempt。
2. 「已提交」只代表供應商接受；delivered/read 必須有已驗簽並正確關聯的 callback。測試 sink、合成 callback、worker 健康頁都不是送達收據。
3. 結果未知時指派 owner、due time 及 delivery reconciliation next action；保留 handoff note。不可改新 attempt key、重建 batch 或因 provider TTL 到期便重發／退款。
4. 唯一且正確關聯的 WhatsApp outbound echo 可以補回 provider ID；同文多筆候選保持未知，交 owner 核對。外部完整內容或電話不貼入工單／證據。
5. 只有明確未接受的429可按原 key 重試。STOP／退訂後拒絕該通知，template approval、locale、WhatsApp window、actor 和當前 facts 必須於發送前再驗。
6. 單張門票補發沿用 paid-seat 規則；批次仍沿用 published/ticketed/future/unchecked 規則。兩者共用 outbox 及 paid-order lock；已有 queued/sending/uncertain 不可藉新 key 重送。
7. queued 保留當前操作；unknown 先對帳；provider accepted 才可建立下一個合理補發意圖。退款中的狀態按既有訂單權威判斷，不能用 comp／TTL 當作付款修復。
8. 暫停 batch pass delivery 保留 queued，不標成已送／永久 suppressed；恢復後沿用原 effect。真正關閉 sender 的平台控制與現有 worker job 狀態另驗，不把 EMAIL_DELIVERY_MODE=test 當 Production paused 證明。

## 供應商／worker 尚待門檻

- Provider owner：核准合成測試身份及收件人；取得 Resend／Woztell accepted-timeout→真 delivered/invalid/bounce 的遮罩收據。只靠目前 sink 或合成 callback 不足結案。
- Platform owner：提供 pin 至已核對 app/worker/source 的隔離 service binding 和服務憑證；驗兩個真排程窗口。不得用 browser cookie 作 worker 憑證。
- 未解除門檻前維持相關 live capability 關閉；人工 inbox/CMS/member/payment 主流程仍可操作。

## 發布與回復

本 slice 無 migration，沿用 ledger59。發布須先核對候選 app source、worker 相容接口、實际 ledger、個別旗標和 provider 配置，再取得本版本 Production 能力授權。此次 PR/main 合併只觸發 Preview，Production 的 release branch 沒有切換。

先暫停受影響新 dequeue，保留 queued/unknown/audit/history；核對 in-flight effects，再逐能力復原。回退 app/worker 須相容目前資料表，不能盲退至會重送未知 effect 的舊 runner；優先 forward repair。故障 UI 可以回退個別呈現 commit，sender safeguard 回退前須保持相關 dequeue 停止。沒有資料刪除／歷史 grant 撤銷／Production migration 回復步驟。

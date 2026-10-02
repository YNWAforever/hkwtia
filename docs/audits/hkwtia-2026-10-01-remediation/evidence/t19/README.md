# T19：客服交接、待辦與未知送達

## 修正及現有介面

程式候選 `9539f5b4b9a7afd9f15ec55a9a9bfa4d8089a949`；交接功能 commit `c47936cd`，發送租約修正 commit `92d9cbbd`，實 SQL projection 修正 commit `9539f5b`。重用 conversations、staff_tasks、messages、audit_events 及既有 dedupeKey；沒有新 CRM、migration 或政策預設。

交接資料為既有 support_followup 待辦的 strict typed context：owner、香港時間跟進日期、下一步、交接原因、關閉原因及支援 reference。application/payment reference 在交易內驗證屬於 thread profile 或有效公司席位。不得存登入連結、token、cookie 或任意 context；不因相同電郵合併身份或權限。own actor 在 server action 自取。

未分派／我的／逾期在 SQL LIMIT 前套用。工作台、待辦及 thread 共用同一資料，不複製付款或會籍事實。owner 名稱沿用現有操作人名單，只有 staff／exco／superadmin 可接手；兩個實際瀏覽器身份為 staff 與 superadmin。一般支援沒有付款、grant、角色、consent 的修改權。

交接使用 conversation owner 及 task version CAS、row lock 與同交易 audit。舊 assign／close／release 與 generic task Resolve 不能繞過已有版本的 support followup。衝突保留表單內容，重新讀取後再決定。關閉須原因及 note。期限由操作者指定；協會 SLA 未獲批准，不新增自動預設。

計劃 lib/admin/task-actions.ts 不另建客服 writer；版本化操作在既有 lib/admin/inbox-actions.ts／inbox-action-core.ts，staff-tasks repository 阻擋弱 Resolve。付款 reference 導向既有 Member360（T08 對帳），送達 reference 導向既有 job-health（T11）。composer 的重試和批准界線保留。

## 行為失敗與最小修正

- 真 SQL 原先接受 member assignee，兩個首次接手均成功；修正角色與版本交易界線。
- 弱 close／release、generic Resolve 可繞過現代交接；補上既有版本檢查。
- React action 失敗後會清除未受控 note；改為受控欄位，衝突時保留草稿。
- 既有 task UI 只有 raw owner ID；使用現有 owner projection。
- 真 built browser 找不到具有唯一名稱的 owner input；補原生控制的明確 accessible label。
- T18 job-health 導覽使用不存在的 title key；新測試讀真中英 bundles 與31個 label，修為現有 heading，不放寬翻譯檢查。
- 真 SQL 發現過期 queued lease 可再次發送：原 queued→queued reclaim 沒有證實外部效果。現在只重試明確拒收的 failed attempt；過期／缺 lease queued 與網絡不確定結果要求先對帳。真正 live lease 顯示發送中；provider accepted、delivered 與 unknown 分開。
- built browser 及新增真 SQL 發現 transcript query 遺漏 provider ID／lease projection，有效租約讀回 false／null；補查詢欄位後以有效、過期及已接收三種實際 SQL 狀態驗證。
- queued live 狀態由 repository 的資料庫時間計算，避免 React render 中 Date.now 的 purity gate failure。

Fixture column 拼錯、Drizzle 包裝錯誤 assertion、route-announcer alert 與重複 uncertain 文案定位器屬測試設定錯誤，修正測試定位，沒有當作產品 RED 或放寬交易／授權。中間完整 suite 在源碼仍有變更時執行，不作最終候選 gate；最終 gates.json 只列固定候選重跑結果。

## 實 SQL、瀏覽器及 provider 界線

focused.json 列265 pass／0 skip／0 fail，18個檔案，其中25個真 PostgreSQL16 SQL（18客服、7既有工作台回歸）。包括並發接手／相同 reply attempt、合法不同 attempt 相同文字、拒收安全重試、expired queued 不盲重試、audit failure 全交易回退、strict references、過期篩選及工作台去重。

同 inbound provider id 在實際 Postgres store 並發及重播只有一則訊息。兩個現有 STOP 同意資料來源實際 SQL 停用且 marketing eligibility blocked；processor 接線及順序另有 focused unit coverage。這不代表 live WOZTELL webhook 或送達 acceptance。

built Chromium 中英兩身份交接、stale draft 保留、mine scope、香港日期、鍵盤 Enter、關閉原因與3筆 audit；financial membership／billing／order fingerprint 不變。畫面中 queued／accepted／delivered／unknown 是明確標示的合成儲存 fixture，provider sends 0。真服務商 test recipient／receipt 未提供時，U37/U38 的 provider 段維持 blocked。axe incomplete rule IDs 在各語言 receipt，人工 SOP 仍由 T22 處理。

測試僅確認隔離 Neon/Auth 與 owned loopback，PostgreSQL16 disposable container。只依本次 exact fixture IDs 退役合成資料；沒有正式資料清理或發送。

## rollout／rollback

本任務沒有 schema／flag 變動。部署交接 writer 前退役舊直接 writer，保留所有 messages、send claims、tasks、audit 及歷史權益。回退必須使用保留版本守衛及「只重試明確拒收」修正的相容 app。

PR118及更舊 app 會重取過期 queued lease，或以 generic Resolve 繞過新待辦；不能直接作客服 writer 回退。若必須切回不相容版本，先於受控存取邊界停止 inbox POST writer，核對未知 provider attempt，然後使用保留安全守衛的修正版本。不能以 RUN_LIVE_WOZTELL=0 代替回退控制，因舊 mock path 可把假送出寫成成功。不得刪除租約或換 idempotency key 來盲重試。

正式 app／worker、cloud isolated acceptance、協會 SLA／通訊目的與測試收件人批准，均另列發布門檻。程式已修與固定候選的隔離結果，不等於正式已發布或服務商驗收完成。

後續真zh browser axe發現breadcrumb只有hover underline、1.49:1色差；`ee00aa28`只加持續底線，沒有停用規則。265 focused 的程式為9539f5b；最後單一CSS修正的focused及browser另列gates.json。完整本機suite於固定9539f5b執行，結果{'passed': 6282, 'skipped': 302, 'failed': 0, 'passFiles': 747, 'allSkipFiles': 83}；它不是ee00aa28的完整suite，最終整合full gate由T22及PR CI覆蓋。

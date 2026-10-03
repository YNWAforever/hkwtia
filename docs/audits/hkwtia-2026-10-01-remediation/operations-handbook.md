# HKWTIA 日常維護 SOP（候選版本）

此手冊是本輪候選程式的操作說明，不是政策批准或正式啟用證明。各步驗收見 acceptance.csv；尚未由職員獨立完成一次全流程。正式部署仍是 T23 明確版本批准邊界。

## 每日開工

1. 從公開頁尾「職員登入」進入管理後台。登入身份、會員檔案、公司席位是不同記錄；同一電郵不能自行合併身份或權限。只用自己的職員帳戶。
2. 查看工作台與待辦。載入失敗要重試或交技術負責人，不能解讀為零宗工作。按「我的／未分派／逾期」確認負責人、跟進日期及下一步。profile 數、付費會籍數、公司席位數不要混作同一分母。
3. 查看 worker 健康：實際 target、source revision、最近成功時間、lag、失敗和不確定筆數。HTTP200 不等於工作成功；disabled、未知版本、未觀察成功窗口不能標綠。沒有已核對的部署身份，交技術負責人核實，勿先重跑。

## 入會與續會

- 從會員檔案查看申請目前保存步驟、已提交／未完成、補件、owner、due 及 next action。補件只索取缺少欄位及支援編號，勿要求交登入連結、cookie 或 token。
- 特別會籍、正常續費、付款修復是三條操作路徑。特別會籍依現有 superadmin／有限期限／理由／review snapshot 流程；不能拿 comp 修補已付款未啟用。
- 付款例外使用付款對帳入口：核對原會員與原 provider event、金額／currency／付款狀態、既有 ledger。確認後修復原交易；勿自行新增扣款、替代訂閱或改歷史 grant。
- 續會提醒保留現有 recurring、past_due 權益、兩處同意及 STOP 規則。D01–D05 未批准時，不增加寬限、退款承諾或免審通訊。

## 批次工作

八種現有操作：profile_patch、membership_grant、renewal_reminder、profile_update_invite、import_commit、export_members、export_event_attendees、ticket_resend。可用性由 server capabilities 決定，不可繞過停用 UI。

1. 搜尋及跨頁選取後，核對真正的 scope、筆數、filter、時間點及合資格／略過／錯誤原因。
2. Preview 後的資料或版本改變，重新產生 preview；不沿用舊 digest。所有效果以 commit CAS 為準。
3. 確認操作後監察每行與總數。cancel 只停止尚未開始的行，不會撤銷已完成效果。
4. lease 失效、provider 已接收但回覆未知或 settlement 遺失：先交 owner 對帳，保留 dedupe key／attempt／receipt；不可按一般重試重發未知外部效果。
5. 只有已知可安全重試的失敗才 retry。歷史 completed 及未知效果不得清除。正式 scale/provider 矩陣尚未全通過，不能直接5000筆上線。

## 匯入與私人匯出

- 上傳 CSV/XLSX 後看五類 review 結果，下載限定 actor／TTL 的最小錯誤清單修正。資料變更需重新 preview。
- 匯入 contact 不代表已驗證登入身份、會籍或同意；不得靠同電郵升權。授權資料更新／邀請仍需獨立批准及測試收件人。
- 匯出是私人附件；使用已批准 scope，下載後依協會資料處理規則保存。過期、其他職員或非 admin 的 URL 不應可讀。不得把私人 CSV 放 PR／公開證據。
- 新版 import digest 與舊 prepared run 不相容：發布前暫停／核對舊工作，cancel 未開始部分並重新 preview；不重播 completed 行。

## 活動與票務

- 活動 header 先核對活動本身、內容／出席者／訂單退款／通知及簽到資料。示範活動不當作公開報名活動。
- 用 order reference 核對 provider、app 與通知三個狀態。paid 不等於已寄出；queued、suppressed、blocked、uncertain 皆不是送達。
- refund_pending 表示自動退款仍未經 succeeded provider 核實，不是退款完成。職員退款沿現有政策；pending 回覆後先核對同一退款，不能盲目新增請求。
- QR 要核對活動和當前票狀態；重掃不增加第二筆簽到。已退款票不能藉重發恢復權益。退款與簽到競爭由 repository 鎖定處理。
- provider failure／unknown 交財務與技術 owner；不改付款為成功、不刪 outbox／audit。測試接收端 sent 不是實際電郵供應商送達。

## CMS 與公開內容

- 先核對目前 published revision；草稿預覽是私人資料。保存、預覽、發布是不同操作；T04 本分頁24小時復原不是跨裝置保存。
- 發布衝突保留草稿，比較新 published copy 再重試；不覆蓋其他職員內容。恢復舊版本亦應建立新發布紀錄，保留歷史。
- 圖片從已批准 media registry 選擇，核對中英 alt、名稱與用途。不要貼任意外部來源或另設上傳平台。
- 79個已批准夥伴標誌、既有翻譯、法律品牌及 published-only 規則保留；新統計／推薦／政策需 content-signoff，不能編造。

## 交接與收工

每個未完成項記 owner、due、下一步與遮罩 reference。客服交接由同一 thread 的版本化待辦處理；owner 及 version 不符時保留草稿，重新載入後核對，不能從一般 Resolve／舊 close 繞過。關閉須原因及交接 note；期限由操作者指定，未批准 SLA 不作自動承諾。會員權限或財務問題交對應流程，不能用客服 profile patch 改 role 或免費解決付款。

發送中必須仍有有效 claim；過期 queued／未知外部結果須先對帳。只有服務商明確拒收的 failed attempt 才可沿原 key 安全重試，不刪租約、不換 key。服務商已接收與已送達分開。

記錄部署 source／worker／ledger／flags／provider mode 與當日異常。只有 actual receipt 和 read-after-write 能簽驗收。正式發布與兩個預定 worker 窗口未核對前，保持「程式已修／隔離已驗／正式未部署／未啟用／未驗證」各欄分開。

## 每週／每月維護

- 每週：會員 owner 對照未完成申請、補件、續會候選與付款例外；財務核對 provider 與 app ledger 的例外；通訊 owner 檢查審批有效期、STOP／consent、未知接收結果。批次只核對 counters 和未處理行，不刪歷史。
- 每週：技術 owner 核對最近兩個實際排程窗口、source／target／lag、TTL retention 與私人下載；expired claim 先判定有沒有外部效果，再按原 key 處理。
- 每月：content owner 核對政策版本／批准文件、公開方案文案、媒體權利與79夥伴；新 URL／數字需內容批准。技術 owner 審查部署／migration／flags／provider 矩陣及回退相容性，變更採小 PR。

## 異常與交接責任

| 畫面／狀態 | 職員下一步 | 接手 owner |
|---|---|---|
| 身份 unavailable／needs-profile | 記香港時間、方法、支援編號與結果文字；不收 email link／token／cookie | Identity／技術 |
| BATCH_PREVIEW_MISMATCH／EXPIRED／VERSION_CONFLICT | 保存所選範圍、重新載入及 preview；不重用 digest | 營運／資料 |
| queued／running 無進展 | 核對 worker target、source、claim／lease 及最近 settlement；未知不 retry | 技術／provider |
| refund_pending／provider accepted-timeout | 財務核對同一 provider reference，再 settlement；不新增請求 | 財務／技術 |
| CMS／inbox version conflict | 保留自己的草稿／note，讀回當前 version 與 owner，再比較 | 內容／客服 |
| 未批准政策／sender／recipient | 保持該功能停用，提交 D01–D06 所需批准資料 | 對應 association owner |

支援引用只記遮罩 reference、case／batch ID、時間與狀態。不得附私人 CSV、真會員資料、keys、cookie 或完整登入網址。沒有批准的支援 SLA 時，due 由 owner 指定，不自動承諾服務期限。

## 獨立操作員验收表（待實際執行）

由一位有對應權限的職員在確認隔離環境完成：登入→找待辦→判別會員／付款／特別會籍→review 一筆 CSV→私人匯出→預覽／取消批次→CMS 儲存／預覽／發布／回復→圖片 keyboard 選取→客服交接→worker 異常下一步。記開始／結束時間、每項成功／失敗、下一步是否找到、支援 reference 與遮罩 screenshot；由職員簽署。建議15–30分鐘只屬安排，並非已量度用時或完成率。未完成的項目保留 owner 與解除條件。

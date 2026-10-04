# HKWTIA 職員日常操作手冊（T18 工程候選）

## 本文件的使用範圍

這是候選程式的操作步驟，不是正式已啟用或全部驗收通過的聲明。正式入口為 `/zh/admin`；英文入口為 `/admin`。功能可見、可讀歷史、可產生新工作、worker 可執行、provider 已送達是不同狀態，須查本目錄 `tasks.csv`、`acceptance.csv`、`environment-matrix.md` 與個別 receipts。

本轮 T18 不改會籍／價格／退款／審批／通訊政策，不執行正式遷移或發送。AI 生成未經政策、registry、key、budget 核准時保持關閉，正常人工維護不依赖 AI。搜尋只讀資料；不讀電郵、電話、訊息正文、其他 agent 歷史或私人草稿，不能用來證明 provider 可用。

## 角色與紀錄

- 職員、ExCo、superadmin 沿用現有管理讀取能力；server 每次從已驗證身份取得 actor。搜尋亦核對 DB 當前 `auth_user_id` 與角色，權限撤銷後不回傳結果。
- 職員只做有權執行的個案維護。涉及特別權益、資金、退款及需審批的操作，使用既有高權限及批准流程；不能按相同電郵合併身份或以 comp 修付款異常。
- 截圖／交班記錄只記合成驗收資料或獲核准的最低資料；不要複製登入連結、token、cookie、key、聯絡資料或正文到 PR、logs 或 evidence。

## 每日登入 → 健康 → 今日工作

1. 從 `/zh/admin-login` 使用受批准的職員登入方式。若身份驗證成功但沒有管理權限，交由身份管理負責人核對 identity/profile binding；不要建立另一個有高權限的檔案。Google／電郵真 provider 驗收依 T14A 解除受控帳戶／測試信箱 gate。
2. 開啟 `/zh/admin/automations#verified-worker-health`。對每類工作核對 app/worker revision、binding、enabled/disabled/unknown、最後窗口。`unknown` 表示沒有足夠證據；不能當成成功、零失敗或全部 worker 故障。未通過兩個真窗口的能力交 DevOps，不自行開全部 flags。
3. 回 `/zh/admin` 的「我的工作」。目前沒有已指派工作時，使用空狀態內的「未指派」入口；所有個案仍可由既有 scope 導航查看。查看 owner、due、逾期與下一步；先處理逾期／付款異常／需人工跟進。
4. 最近批次列出成功／總数與失敗数；開既有 batch detail 看逐筆結果，不把全頁摘要當成逐筆成功。

## 尋找會員或個案

- Topbar 的「搜尋工作台」：按名稱或紀錄編號尋找會員檔案、公司、申請、活動及支援對話，結果分組顯示。最多 120 字元，每頁 20 筆。空查詢不掃全表；游標綁定目前 actor 與查詢，改查詢從第一頁開始。
- Topbar 的會員搜尋／`/zh/admin/members`：使用既有會籍／公司／狀態／分群條件。工作台搜尋不新增資格判斷或会籍篩選。
- 找不到紀錄：換名稱或 ID；不要直接建立重複身份。權限變更：重新登入獲授權帳戶。服務失效：重試，或從側邊欄開相關隊列；失效不等於零紀錄。舊 cursor 無效：重開第一頁。
- Browser Back／Forward 保留搜尋與分頁 URL。開申請、對話或 batch detail 後，使用原案／返回入口；CMS 若有未儲存內容，離開前遵循現有提示。

## 補件、審批及付款異常

入口：`/zh/admin/members/queue` → 現有申請詳情。角色：現有管理職員，批准／權益操作另按既有高權限。

1. 核對 application、profile、company、membership、billing attempt，不能把一個狀態當成另一个狀態。
2. 使用現有 required-field 規則確認缺件。電話、網站等選填欄位不能突然變成必填。套用規則只填個案欄位，沒有保存／發送。
3. 指派 owner、due、下一步，人工備註按既有 CAS 保存；讀到別人的新版本時先重新載入，不覆蓋舊表單。自己的保存應保留成功提示與 audit timeline。
4. 已完成付款 attempt 但會籍未啟用：交付款對帳；不再次收費、不以 comp 代替、不自行退款。補件、審批與付款修復各自走其服務。
5. AI 開關關閉时直接使用人工流程。有草稿時先查看 facts／來源／版本，edit 会清批准，facts 變更會變 stale。批准與採用是兩步；採用只保存已核准正文為個案 note，不審批會籍、不更改資金或發送訊息。其他編輯未保存時先保存或放棄再採用。

工程證據：`evidence/t09/verification.json`、`native-combined-receipt.json`；完整入會／續會連接驗收另外見 T14B。

## 支援回覆與通訊同意

入口：`/zh/admin/inbox`、mine／unassigned／overdue scope、現有對話詳情。角色：現有管理職員；送出需再次驗角色、facts、consent 及 channel/provider 狀態。

1. 開原對話，查看需要人工接手的原因、owner、due、窗口、來源。
2. 人工或 AI 只摘要／起草，未覆核不得當成已送出；採用 composer 與 send 是獨立動作。
3. 保留兩個 consent stores、取消訂閱、template／locale 核准與 per-attempt dedupe。授權發送的能力需 worker/provider readiness 與受批准的收件人。
4. provider 可能已接受但回應超時時，保持 unknown／receipt，交對帳；不換新 key 盲重送。未對帳不將 TTL 到期當退款或效果已取消。

工程／送達 gate：T10、T14D；sink／mock／outbox 記錄不是實際送達證據。

## 批次預覽 → 保存 → 部分失敗／unknown

入口：`/zh/admin/members`／segment → 原 selection/bar、`/zh/admin/batches` 歷史。八種既有操作依各自 flag、role、approval、readiness。

1. 用鍵盤逐列選取，預設目前頁。跨頁全部篩選须明确確認 scope、版本、資格與總数；51／101 分頁回歸見 T00/T18 receipts。
2. 預覽固定 snapshot／previewDigest，查看可執行、略過與原因；資料變更後重新預覽，不能自行扩大 audience。
3. Commit CAS；同 snapshot 的雙提交不得重複副作用。能力關閉時仍讀歷史及停用原因，不強行排隊。
4. 部分失敗逐筆分類。未開始的工作依現有 retry／lease；已請求／provider accepted-timeout 按 receipt 對帳，不盲重試。取消停止新工作，保留 audit／已完成與 unknown。
5. Export／import 看進度與逐筆結果，使用合成資料驗收；正式匯入需本 session 的具體授權與 release gate。

工程證據：`evidence/t03/verification.json`、`fixed100.json`、`batch-scale-matrix.json`。真 cloud windows／provider receipt 未通過時不能標「營運啟用」。

## 活動與 CMS

- 活動入口：`/zh/admin/events-mgmt`，確認日期、場地、名額、registration mode、HKD cents。AI 翻譯不改業務欄位。付款／退款／票券用既有 Stripe／worker 路徑；退款或 unknown 先對帳。真 test-provider 證據見 T14C。
- 內容入口：`/zh/admin/news`、`/zh/admin/page-copy`、`/zh/admin/media`。編輯 → 保存 draft → preview → 按既有 role／CAS 發布。草稿與 published 分開；Browser Back／Forward 不應捨棄草稿。圖片與歷史內容／機構名稱以核准來源為準。
- 新版／回滾时停新 writer，不删 audit／已批准版本；migration 不逆刪歷史資料。詳見 T17 與 capability release matrix。

## 交班、每週、每月

每日交班列：原案入口、owner、due、最後 case/draft/batch version、下一步、status、receipt reference、unknown 是否需對帳、阻礙負責人。不要附登入／聯絡資料或未遮罩正文。

每週：查看已核准 policy／knowledge 到期、失效来源、錯誤／拒絕／stale 抽樣、批次部分失敗／unknown、worker 窗口。更改政策由原批准人／ExCo 决定，工程 configurable defaults 不能當已批准政策。

每月：續會與付款修復分開核對；KPI 保留分母／期間／unknown；比較人工 baseline 與 AI review／rework 总時間；預算／实际 usage／invoice／potential duplicate cost 對帳。未收足兩週人工基線不聲稱節省。

## 職員試點及故障回復記錄

T18 source/native 工程測試與 3–5 位真人職員 G5 試點分開。下面尚未收集，不填虛構完成率或時間。每位職員須在確認隔離環境完成：補件保存、來源回覆草稿／人工接手、50 筆 batch preview／部分失敗復原、CMS draft/preview/publish。發送／付款只用獲批准 test provider 與合成收件人。

| 記錄 | 必填 |
| --- | --- |
| 身份 | 匿名職員編號、實際 server role、環境／SHA |
| 任務 | 入口、case/snapshot/draft version、所需批准／provider gate |
| 結果 | 完成／失敗／blocked、開始／結束、review/rework 時間 |
| 錯誤 | 可復原／不可逆誤操作、是否要工程師介入、receipt reference |
| 阻礙 | 缺項、owner、最小解除證據；不能把 skipped 當成功 |

目標：每項關鍵操作可獨立完成，零不可逆誤操作；未達時修 UI／SOP 再驗。AI 試點按 T16：先 2 位職員、50 cases/day、draft-only 一週；須有具體 capability release 授權，不能在本 T18 自行啟用。

工程驗證：T18 exact28322fd3 的工作台搜尋／角色拒絕／五類結果／51及101筆游標／Browser Back與Forward／中英390px及鍵盤共9項真瀏覽器驗收通過；見 `evidence/t18/verification.json` 及 `native-28322fd3-worker-0.json`。這不代表真人職員試點、segment所有條件、付款／送達或正式發布完成。

### 已完成入會及待付款返回復原（T14B）

會員可由原申請返回既有會籍結果；已完成申請讀取失敗時使用聯絡支援／會員專區，記申請參考，不另建權益。公司待付款從原Checkout繼續使用同一付款嘗試；瀏覽器顯示成功或帶session參數不是付款證據，必須核對Member360的provider事件及會籍狀態。過期／舊invoice保持對帳歷史，不能新增續會engagement或倒退已付款期間。不得以comp、手改paid或撤銷歷史grant修復付款。實際StripeTEST證據：evidence/t14b/stripe-test-provider.json；受控重播並非正式webhook自動送達驗收。

### CMS 草稿、發布、還原及公司標誌（T17）

職員由 `/zh/admin/page-copy` 選實際 namespace/block。中英欄位分開編輯；「此分頁暫存」只是本機分頁，不是伺服器保存。儲存私人草稿後，另一個登入裝置可取回；其他編輯者及匿名讀者不能查看。先開私人預覽，再以獨立「發布雙語文案」操作提交；發布與 audit/CAS 同一 transaction。另一分頁或編輯者版本衝突時保留內容，重新讀取／比較後按既有 rebase，不覆蓋他人版本。

返回 list／Browser Back與Forward／刷新後使用明示恢復草稿。瀏覽器拒絕 storage 時警告是真實的，仍保留表單內容；離線編輯只有本機草稿，本輪未聲稱離線伺服器 Save 成功。切換帳戶／登出後不應看見前一身份草稿。

回復舊發布：勾選前版內容、建立私人還原稿、預覽，再獨立發布；還原私人稿未改公開版。不要 SQL 刪 history 或直接修改 published 值。每次發布保留 version/audit。

公司標誌仍被引用時封存會回 MEDIA_IN_USE；確認真正依存及核准替代，不能為清媒體把公司 logo 清空。公司提交時即使預檢成功，transaction 仍重驗媒體由該管理者擁有、未封存並鎖行；競爭結果應回可復原錯誤，不附上已封存媒體。

`content-signoff.csv` 列每個可編輯 CMS／typed programme field 的來源、owner、版本及待簽核狀態。工程測試、既有公開版與 archive transcription 不等於新政策批准；79家既有關係／標誌已有 session 授權，但外鏈只用批准且已儲存 URL，不自行猜公司網址。Profile records、active membership records及unrevoked company seats是不同分母；active 包括免費／特別 grant，不代表每筆已付款。

證據：`evidence/t17/verification.json`、`browser.json`、`public-extra.json`；正式仍未部署此候選。


## T14C 活動／付款復原（2026-10-04）

入口 `/zh/admin/events-mgmt`、`/zh/admin/events`。先核對 external／RSVP／ticketed、HK日期場地及名額；價格輸入為HKD，server保存 cents。保存草稿→私人預覽→有權限職員鍵盤發布。RSVP duplicate不新增名額，候補不變成已付款。

付款取消回跳可繼續原Checkout；回跳不當paid。若Stripe已確認過期，僅已授權的原 recovery cookie 可清除；本地TTL或讀取失敗保留並對帳。不要另建attempt避過未知外部效果。退款使用既有全額政策：pending不當成功，不盲重試；succeeded後票券失效，failed顯示待處理並查provider receipt。confirmation／pass／refund outbox各保留一次effect與audit。

工程實證：focused171（actualPG23）、native4、realStripeTEST9、signed callback12、Preview17及full6652pass/471skip。sink通知不代表真收件人送達；Google／magic-link、automatic remote webhook、cloud worker windows及3–5職員G5仍未完成。詳見 `evidence/t14c/verification.json`。


## T14D sender recovery

Follow [繁中 sender recovery SOP](delivery-recovery-sop.zh-HK.md). Unknown network/server/accepted-timeout effects are held for provider reconciliation; retry only proven refusals with the same intent. Staff pass resends use the existing durable ticket outbox. A queued response is not Sent; preserve the intent until settled. Recheck current recipient, both consent stores, window, locale, approval and order authority before dispatch.

## 收件匣回覆助手（T10）

按 [回覆草稿 SOP](support-draft-sop.zh-HK.md) 操作。從對話的「覆核草稿」進入統一隊列，按負責人、期限、種類及狀態篩選。核准與採用到回覆框不會發送；另按發送才會重驗現有兩個同意來源、時窗、範本及職員身份。多選須逐筆讀取結果，unknown 先對帳。未獲模型、資料用途或預算批准時，直接人工跟進；加密保留缺配置或已過期時，不會顯示假成功。

## 續會草稿日常維護

依 [續會草稿與人工審批 SOP](retention-draft-sop.zh-HK.md) 核對資料版本。批准只記錄決定，續會批次與 sender 各自重新預覽／審批／確認最新同意。Unknown 先對帳，不用新 request key 或跨日重跑繞過保護。AI 預設停用；工程證據不代替 provider/worker/人員驗收。

# T18：每日工作台及會員維護

## 修正範圍

保留原23個導覽目的地，依六組重新排列；加入現有申請 queue 及 job-health 的兩個可尋入口，合共25個連結。Lucide語意圖示配文字；既有 sidebar、drawer、unsaved guard、localizedPath 及角色守衛保留。

今日工作是現有申請、會籍、billing attempt、human conversation、staff task、未發布內容及本人私人CMS草稿的讀取模型。20列 keyset、owner/scope/actor/flag-bound cursor，timestamp文字保留微秒；只有本人私人草稿能進入 all scope。沒有複製付款／會籍事實，沒有付款、發送或 grant 行為。續會沿用既有120日 at-risk 工程窗口及 eligibility predicates，沒有新協會政策。

未完成及已提交申請分開；profile records、active membership records、公司席位分母分開。active包含免費／特別會籍，不能讀作所有紀錄已付款。讀取失敗顯示不可用，不冒充0或空列表。

會員搜尋先於其他工具；advanced filters、saved views/tools 收起。公司以有界私人註冊名稱 autocomplete 取代UUID輸入，server自取actor，只讀id及名稱。ArrowDown/Enter選擇；未選定搜尋文字阻止GET提交；舊回覆不覆蓋新搜尋，失敗與零結果分開。GET、keyset、Browser Back及既有會籍篩選規則保留。

Member360首先顯示已儲存subject link、會籍／期限、付款嘗試、owner及下一步；subject link不冒充Google/provider重新驗證，attempt completed不冒充會籍已啟用。Stripe identifiers及低頻會籍歷史收進details，原連結與資料保留。

## RED → GREEN及失敗分類

- 既有五組導覽／首字圖示、未收起advanced filters、草稿工作與計數缺漏先有UI或真SQL失敗，再修正。
- 等微秒timestamp第二頁SQL有ambiguous id；改成qualified tuple，真SQL50列20/20/10無重複／遺漏，跨scope/actor cursor拒絕。
- 公司搜尋、取消選取及搜尋錯誤、Member360維護摘要分別先有目標行為失敗，再有真SQL／UI通過。
- 完整gate發現新SQL置於domain層違反既有repository boundary；移至lib/db/repos/work-queue.ts，原guard不放寬。
- 舊count、五組導覽及company-reader缺失的測試fixtures改為新契約；原本選取翻譯及錯誤可用性斷言保留。
- 首輪未限制worker數的full gate，Auth lockfile子程序在高並發下ETIMEDOUT；單獨同一測試通過，再用既有maxWorkers=4完整重跑；不改timeout。
- 瀏覽器最初fixtures只有公司席位、沒有公司會籍，按現有公司會籍篩選規則應為空；更正合成資料。後續cell／雙detail-link定位器不符合既有rowheader與name+View兩入口，改用正確語意定位。這些是測試設定失敗，沒有改產品規則或稱成功。

- 真browser axe辨識Overdue文字4.37:1未達4.5:1；只將新badge文字調深，不停用contrast規則或改全站theme。修正後結果另列browser receipt。

## 路徑映射及相容性

計劃lib/admin/work-queue.ts為domain-facing讀取契約，SQL實作依AGENTS現有邊界置於lib/db/repos/work-queue.ts；沒有第二個資料來源。既有companies repository擴充searchAdminCompanies，own-actor server action在lib/admin/company-search-actions.ts。member table／filters／Member360及dashboard延伸原組件，DashboardTiles重用而未重建。

本任務無migration，無新feature flag，無Production/provider effects。CMS私人草稿分支仍受T17既有default-off flag控制。回退只回退app導覽與讀取UI；保留原角色、付款、會籍及其他任務schema/history。

## 證據

axe在14個實際畫面掃描零violations；incomplete rule IDs另列receipts（mobile color-contrast、drawer aria-hidden-focus／aria-valid-attr-value），不能當作全站或所有無障礙規則已驗證。真鍵盤Tab trap、Escape focus return及公司ArrowDown/Enter通過；剩餘人工視覺／職員SOP仍T22。

focused.json列實際185pass/1skip/0fail，9真SQL；另23既有會員回歸pass。中英built Chromium receipts及390/768/1440截圖分別列實際操作、axe與限定範圍。完整gate結果及skip inventory另記gates.json/evidence/gates/t18-skips.json。合成fixtures只依本次exact IDs清理，不清理舊會籍或交易。

### UI檢視（限實際查看畫面）

| 項目 | 修改前證據 | 修改後證據 |
|---|---|---|
| 入口 | 舊source五組、23目的地及重複首字icon | 真browser六組、25語意icon/text；desktop及mobile |
| 會員篩選 | source首屏完整advanced controls及UUID欄位 | 收起advanced；390px註冊公司名鍵盤選取與Back保留 |
| 詳情 | sourceStripe IDs及歷史攤開 | 390px維護摘要先顯示；provider identifiers/history折疊 |
| 狀態 | source沒有草稿工作及分母 | 真SQL草稿／提交／profiles／active／seats分開；付款attempt獨立 |

這不是相同部署／資料的視覺before-after實驗，沒有宣稱視覺效能提升。人工職員SOP、全站角色、financial reports、batch preview等綜合操作仍由T22驗收；T19支援維護及T20公開入口／文案繼續執行。

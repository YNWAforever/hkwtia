# T20 公開內容核對及批准邊界

## 2026-10-02 只讀 baseline

匿名真 Chromium 讀取現有 Production `/`、`/zh`、`/partners`、`/zh/partners`：全部HTTP200；header會員登入及footer職員登入各有一個既有連結。Partners中英各79列。這是現有Production讀取，不是候選版本驗收或發布。

Partners sourceNote.title 中英仍為「Published records, not a scraped logo wall.／已發布的紀錄，而非抓取而來的標誌牆。」：內部驗證語意仍成立，需修正。已正常的登入入口不用重建。

確認隔離Neon只讀：Home／Partners／Membership published copy overrides零列，夥伴published58supporting／15regional／6media。沒有編造新增合作、統計、推薦、方案、價格或法定品牌。原79合作關係及logo使用批准沿用本執行session已明確確認；此批准不能延伸新政策。

## 文案變更範圍

只將 Partners.sourceNote.title 改為中性介紹「Meet our partners／認識合作夥伴」。hero、關係／logo確認、法律品牌、有效期間、79資料、發布predicate及媒體註冊來源保留。

候選built Chromium4 pass：中英header／mobile／footer／已登入職員返回後台、79 lazy images 實際載入、非空 URL 才適用的 HTTPS predicate、published合成公開活動可見及private/demo排除。證據evidence/t20；外站HTTP可達未驗證。Production DB的CMS overrides沒有可用readonly credential；不冒充已查資料庫。已觀察到的Production rendered title確定仍是舊文案，候選DB沒有override；發布前operator需經既有CMS核對及以CAS處理任何當時override，不得盲刪所有copy。

## 內容與業務批准門檻

| 項目 | 工程證據／規則 | 待批准／待核對責任 |
|---|---|---|
| 79夥伴 | 此session全部關係及標誌權利已確認；保持58／15／6 | 新增或改關係由協會content owner逐筆批准 |
| 會員／申請／公司席位 | T18分母及T05身份規則，不把login/profile當有效會籍 | 會員主管核對對外價值與服務摘要 |
| 方案及費用 | 沿用既有server catalog／Stripe；不公開price ID | D01／D02政策版本及中英條款：會員主管／財務 |
| grant／退款／通訊 | 依現有server角色／期限／審批／consent；不增加承諾 | D03–D05治理／財務／營運 |
| 法定品牌／發票 | 保留既有文本，不新增中文法律名稱 | 協會正式批准後另作可審變更 |
| 本輪發布 | 無Production寫入或新flag啟用 | D06及具體候選版本發布批准 |

本文件是工程內容核對，不是協會政策批准；registry空值、Google／mail provider、人工SOP及Production新版本均不記成pass。


## T23 非空目的地核對

再次直接只讀查現有 79 筆已發布夥伴：`website_url` 全部 NULL，79 個沒有目的地連結；外站 HTTP 呼叫 0。先前 HTTPS predicate 在空集合通過，不能作外站可達證據。圖片已實際載入與 79 logo/關係的既有批准仍成立；網站目的地若要新增，需 content owner 提供及批准逐筆 URL，再驗 HTTPS／可達性。不得推測或編造連結。此項不改動正式資料。

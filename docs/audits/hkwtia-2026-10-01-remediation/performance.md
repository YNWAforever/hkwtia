# T21 效能與快取驗收

## 量測界線

完整ledger56、同一現有repository及filter，合成50／500／5000 profile/membership；零provider效果，兩環境的own fixture均已清理。Windows workstation的地理位置未建立；Neon ap-southeast-1是DB位置，不能冒充香港／新加坡兩個測試端。

本機application/query SHA `f327fd334e7766b22102154bf1959310b658ab78`，runner当时未commit，精確檔案SHA256見receipt。其後只format及增加來源/guard文件，query source未改。Neon runner SHA `2888c483b0f23ac3c18094be57a27f88c7418a06`。

舊基線是以同一當前repository重現先前50筆keyset paging算法，不是checkout/reset历史版本。各operation/scale獨立fresh physical pg Client connection sample，再30 warm樣本；seededDB buffers未flush，不稱DB/OS冷啟動。新連線包含DNS/TCP/TLS/Auth，不能當純TLS。

## 同環境 SQL 實測（ms）

|環境|規模|操作|warm數|median|p95|SQL round trips|
|---|---:|---|---:|---:|---:|---:|
|local PG16|50|snapshot|30|25.31|44.63|1|
|local PG16|50|list|30|37.61|49.19|1|
|local PG16|50|legacy-paged-selection|30|29.26|46.64|1|
|local PG16|500|snapshot|30|271.07|349.54|1|
|local PG16|500|list|30|213.64|285.79|1|
|local PG16|500|legacy-paged-selection|30|3067.92|7229.95|10|
|local PG16|5000|snapshot|30|70.76|106.03|1|
|local PG16|5000|list|30|173.08|336.47|1|
|local PG16|5000|legacy-paged-selection|30|11479.11|23946.15|100|
|isolated Neon|50|snapshot|30|86.86|104.68|1|
|isolated Neon|50|list|30|133.45|140.84|1|
|isolated Neon|500|snapshot|30|115.49|244.07|1|
|isolated Neon|500|list|30|108.66|118.85|1|
|isolated Neon|5000|snapshot|30|114.11|262.52|1|
|isolated Neon|5000|list|30|134.00|145.31|1|

所有量測observed error rate0；數量、唯一ID及scope逐樣本驗證。30樣本median為第15/16平均，p95為nearest-rank第29。Plans只保留node/row/time/buffer欄位，沒有SQL條件/search term/PII或連線字串。

現有T13 snapshot及T17公共locale cache已符合這些實測；沒有證據支持再改index、region、bundle或Auth cache，因此未重寫已修正路徑。這證明repository selection/list查詢，並非整個HTTP preview/CAS/materialization端到端p95≤2秒。

## 現有Production匿名HTTP只讀

四個安全無參數路由各1 client-cold+30 warm、新curl process/no cookies；全HTTP200、0mutation。這是現有正式部署，不是候選版本before/after或staging驗收。

|路由|total median/p95 ms|TLS median/p95 ms|TTFB median/p95 ms|
|---|---:|---:|---:|
|/|1155.24/1344.79|92.81/127.66|554.16/737.14|
|/membership|1228.41/1435.11|91.63/109.45|738.50/809.96|
|/partners|1631.22/1715.25|97.18/117.03|972.96/1120.14|
|/admin-login|1249.68/1403.60|93.71/126.68|778.92/908.19|

curl appconnect-connect只量TLS段；TTFB是request全路徑，不能由此推断DB慢。历史约8秒单样本不能覆盖此轮实测，也不能归因DB。

## 快取與真integration

T21候選b0f3d30a：2 builtChromium pass／0skip／0fail28.1s。Member、company-admin及guest的en/zh公開news相同且无身份email；Privacy新draft未改warm public copy，foreign/anonymous不见draft，owner真实editor为no-store；explicit双语publish及restore/publication使两个guest即时读新／旧标题，public rows恢复原样，immutablehistory保留。Home真实版面privatepreview/noindex及actual SQL owner/public隔离复用T17。没有给Authlayout加共享cache。

拟新增audit-full-cache-boundary.test.ts映射到现有audit-full-cms-workspace.test.ts：9actual PG16，getDb注入实际DB，repository与SQL未mock；加9纯targetguard及2migration recovery，共20focused0skip/0fail。精确命令/outputs见T21/T22evidence。

## 尚未證明

- Lighthouse 預設 simulated 實際失敗：Lantern dependency graph cycle 及 Windows Chrome-launcher EPERM。補充 DevTools 模式已收集報告，但門檻未通過；語言已校正後另測，threshold 未降低。匿名 loopback HTTP 各路由 30 warm 已執行，receipt 見 evidence/t21/http-loopback.json。
- 香港／新加坡独立网络runner：技术运营需提供真实两个观测点。
- RUM mobile/desktop p75 LCP/INP/CLS：analytics owner提供实际足量公开traffic，Lighthouse不能替代。
- 整体HTTP preview/materialization/worker scheduled两窗口／云Preview identity：T22/T23负责，既有T11四个actual local scheduled episodes只能证明localcomposition。
- 当前source未Production发布；不会把隔离benchmark当正式SLO达标。

## 首頁最小修正（55c2d036）

兩個實際 browser RED 顯示 hero 缺 fetchpriority=high；corrected unit RED 顯示拒絕讀取被誤報成沒有活動。受控真隔離 DB table lock 的 Chromium RED 顯示 pending read 時 #home-discover 不存在，hero/Pathways 已顯示。修正是 eager/high 主圖、保留雙語載入 anchor 的首屏預留區、獨立 read-unavailable 提示；公開 cache/Auth/DB index 未改。

68 相關 regression pass／0 skip／0 fail；5 built Chromium pass／0 skip／0 fail，13.4s。兩語言受控 390px、150ms／1.6Mbps／4xCPU 的 CLS 均0；只是兩個 laboratory samples，不能簽 RUM p75。

Lighthouse 前後的語言、profile 及負載不同，不能把全站分數差當因果改善。原補充 profile /zh CLS 約0.1616，修正後同路由目前0；這仍是單次量測，pending anchor 真 SQL/browser 測試才是可重現回歸證據。raw reports 留在 ignored 目錄；只交付無 headers/cookie 的指標摘要。

## 正確目標／原門檻重測

已用 NEXT_PUBLIC_SITE_URL=http://localhost:3450 建置，原 simulated 模式、原 perf≥0.90/access≥0.95/SEO≥0.95 門檻、fresh owned browser 與 enAccept-Language。10個實際中英報告全部 SEO1、CLS0；55c2d036 performance 仍有 /0.89、/zh0.84、/zh/events0.81 不達標。這證明先前canonical0.92是環境設定；沒有更改正式canonical或metadata。

/events 主圖亦重現缺 fetchpriority，27832bdc 對共用 PageHero 作同樣 eager/high 最小修正，保留priority=false的lazy契約；7built browser及83focused pass。新增 runtime 文案不擴大CMS：原166keys由共同read/save guard保留。最終完整gate及新LHR另記，不能把單次 laboratory 指標簽成p75或已上線。

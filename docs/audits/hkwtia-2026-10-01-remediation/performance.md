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

## 私人導覽 Auth 讀取觀察

143f2d46 真 built Chrome、synthetic staff、25可見sidebar links：未導航先在8秒idle/hover收到29筆Next protected-route prefetch。receipt只存pathnames。323/2/162的完整較慢瀏覽器run亦有1筆真getSession provider Too many requests；不能把所有provider限額失敗都單憑此歸因到預載。

af4b8656 對既有GuardedAdminLink關閉idle/hover prefetch；server Auth、role、private cache和dirty-navigation流程保留，點擊才取目標route。目標2 unit RED→80相關focused GREEN；新built browser before/after及完整gate另外記實際結果，不把quota配置或production SLO推算為已改善。

5b4ac2f4：真 built Chromium 原操作速度、同一8秒idle/hover窗口，protected prefetch29→14→0；target1 pass／0skip／0fail，點擊到達會員route。兩語dashboard8links各有目標RED，90相關focused pass／0skip／0fail。此結果只證明已量度入口及源碼控制，並不推定provider quota設定、HK/SG/RUM或Production SLO。

## 私人清單與實際 public 圖片觀察

5b4ac2f4 en built browser兩個8秒窗口：會員清單11個自動prefetch、inbox22個；兩個正向authorized heading已可見後assert zero失敗。42930d9a共用PrivateLink只改51caller import及fixed prefetch=false；新full/browser另記，不推算provider限額。新boundary具有hostile/safe樣本及真舊import RED。

5b4ac2f4原simulated10報告均完成，無runtimeError。perf/axe/SEO如下：/0.86/0.97/1、/events0.87/1/1、/membership0.93/0.97/1、/partners0.94/1/1、/programmes0.92/0.96/1、/zh0.91/0.96/1、/zh/events0.75/1/1、/zh/membership0.93/0.97/1、/zh/partners0.90/1/1、/zh/programmes0.89/0.96/1；CLS皆0。此為原budget失敗，不能把收集成功稱門檻通過。before receipt保存。

具體圖片audit：headerWTIA logo在約66／88px tile下載至3840px；root responsive-image浪費41022 bytes。8119b7f3保留byte-pinned原圖與品牌文字，只以sizes指定既有CSS內容尺寸；unit目標RED→GREEN，新的原門檻重測另記。HK/SG、真RUM/p75及已批准SLO仍需owner提供。


## T22 continuation: native Auth absence, stable keyboard focus and client catalog (Oct3 HKT)

Application commits f7599e89 / 189c075e / 999e6b78 preserve the strict Auth provider query (cookie cache and refresh disabled), all server actor/role boundaries and association/provider policy. Anonymous built route: actual upstream session read 1 -> 0, no provider substitution; credentialed/forged cookies and Authorization still reach provider validation. Focused Auth/actor/session tests: 123 pass, 0 fail, 0 skip. Strict missing Production configuration still fails closed.

A real isolated `site_announcements` ACCESS EXCLUSIVE lock reproduced both locales accepting focus in the temporary header (2 intended RED). Temporary controls now inert and aria-hidden; after rollback the stable localized login focuses and Enter navigates: 2 native pass. The ordinary seven-width/two-locale login cases passed 14/14. Initial wrong table-name and shell-encoded label failures were corrected in the test, excluded from behavioural RED/GREEN, and the test now reads the actual UTF-8 message catalog.

Root client messages now contain usable Error recovery only; authorized Admin/Portal layouts retain the full catalog after their own actor boundary. Both locale real Error consumers and private catalog/redirect tests: 11 pass. Native public payload 2 pass; private five-case built Auth navigation 5 pass, 0 skip with its required legacy `1` guard (a preceding wrong-flag collection skipped five and is not acceptance).

Actual raw HTML transfer bytes: en 331361 -> 151231; zh-HK 320477 -> 149494. Native normalized serialized Admin namespace present -> absent, Error remains present. Body/provider payload/credential values were not recorded. These are controlled loopback before/after payload measurements, not HK/SG/RUM or a causal claim about Lighthouse scores.

Exact 8119 historical full unit: 6330 pass / 1 Auth-lockfile subprocess timeout / 329 guarded skips; unchanged idle security target rerun 13/13 pass. Exact 8119 full browser: 324 pass / 6 fail / 162 guarded skips; legacy 13 pass / 6 fail / 0 skip. Those failures remain recorded. Lighthouse historical collector accidentally mixed 10 prior reports; corrected current-only fetchTime filter retains exactly 10 8119 reports and its actual three under-budget routes. Current collector now enforces that filter and route count without threshold changes.

999e full-gate attempt was stopped after lint rejected two raw local-anchor test mocks. Native Next Link replaced those mock links; no lint rule, timeout or assertion was weakened. Stopped/not-executed cases are not skips or passes. Fresh full/static/browser/original Lighthouse gates will be recorded separately after completion. Production e7fa4add remains unchanged; current Preview metadata is distinct from its runtime acceptance.

## 最新原門檻Lab結果（應用3bc，99d5僅test readiness）

Actual10 routes全部達既有simulated門檻performance≥.90／accessibility≥.95／SEO≥.95，最低.91/.96/1；receipt evidence/t22/lighthouse-current.json。Fresh run只取fetchTime>=開始且恰好10routes，沒有混入舊report、改門檻或切mode。Loopback／隔離G0DB／Windows Node24／原network simulation，不能外推HK/SG/RUM p75或Production SLO。

Public HTML en331361→151231、zh320477→149494 bytes及private automatic-prefetch11/22→0是各自受控native前後量測，沒有將TLS、DB、Lab與RUM混作同一因果。2秒Auth harness仍8×429；5秒targeted37×200，只說actual受控驗收而不推定providerquota或正式延遲。


## Exact99 original full native collection: completed, not green

`T22_SOURCE_SHA=99d5b11974644c06318da4f91d20bf39a8615b9a`; `T22_AUTH_PROVIDER_MIN_INTERVAL_MS=5000`; `T22_REPORT_PATH=.playwright/t22-browser-final-single.json`; `node .playwright/t22-run-isolated.mjs .playwright/t22-e2e.mjs --workers=1`. Original498 cases, original timeouts/roles/limiter/provider retained; Windows Node24/built Chromium, confirmed G0 ledger56/Auth, TEST Stripe and email sink. Started2026-10-02T21:57:35.121Z; duration3814668ms. Actual332 pass/4 unexpected/162 genuine skips/0 flaky/0 collection errors. Native receipt `evidence/t22/browser-99-single.json` and per-case skips; actual Auth597×200/3×429, observed get-session max rolling60seconds13, quota threshold unknown/no Retry-After. This observer does not count every Auth path and cannot infer a threshold.

CMS line331 timed out during other editor's private rebase after explicit publication/revert; previous public state was restored. Read-only reconciliation at23:03:22UTC proves2 owned published versions and equal effective overrides; one synthetic editor's open private draft retained, no raw cleanup/history deletion. Negative role matrix line244 and CMS line331 exceed180seconds under5000ms pacing, no429 within those cases. C2 wizard line275 shows safe app error boundary in the same window as1×429; D4a sign-in/protected probe failed in a window with2×429. These are timing/provider observations, not permission to disable Auth or claim a database cause. The same unchanged original cases passed at3bc/2000ms; fresh exact99 targeted replay is recorded separately.

Operator gate: Neon/Auth owner must confirm isolated quota scope/window/reset or dedicated acceptance capacity before a new complete run. Redacted branch/config readback exposes no numeric quota setting. A proposed split of the role matrix was not applied: it would not resolve the sustained provider constraint or CMS timeout. No retry of an unknown payment/publication effect, test timeout increase, skipped assertion or production flag change.


### 原條件定向驗證

Original四個失敗案例在exact99、2000ms、原180秒timeout、原完整role matrix及真provider下定向重跑4 pass/0 fail/0 skip；90×200/0×429。CMS62435ms、negative role95997ms、wizard28402ms、en TEST checkout11045ms。程式/斷言/timeouts沒有改動；原332/4/162仍保留，不能合併為單次完整綠燈。 證據：`evidence/t22/browser-99-targeted.json`、`browser-99-failure-disposition.json`；完整quota/readback gate仍在。

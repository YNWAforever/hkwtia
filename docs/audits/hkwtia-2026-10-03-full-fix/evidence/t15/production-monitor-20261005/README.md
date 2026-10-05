# T15 正式冷首頁效能反證及選用 CPU 診斷 — 2026-10-05

- 原排程 run37289652737 及相同 gate 的 manual run37309208646 均 FAIL：只有英文首頁 performance0.88／0.82，另外九頁各自通過；全部 CLS0，無 runtime error 或 extra headers。結果及觀察時間逐 report 保留於 results.json。
- Linux Chrome154／Lighthouse12.6.1 第一首頁的 TBT351.5／567ms；正常 gate 的10URL／1run／median／0.90 performance／0.95 accessibility／0.95 SEO 沒有變更。不把 document response 的19.757／2.596ms當成 DB time。
- 本機 Chrome149 明確 Accept-Language=en-US 的獨立冷 browser EN0.97／0.98、ZH0.97，是不一致的環境反證，不是 Linux failure 修復。另三個 OS-locale `/`→`/zh`及 Lantern warning 的初版嘗試只留 ignored raw files，沒有當作英文成功。
- 本輪 app/auth/payment/DB/worker/flags/provider 無修改。先取得原 baseline 的 CPU profile；root cause 未確認，不猜改 framework 或 CMS 政策。

## 可執行的來源與邊界

- .github/workflows/weekly-lighthouse.yml 增加 capture_profile=false 的手動選項。啟用時直接在原 URL／次數／門檻採樣，不先跑正常 mode warm-up；正常 schedule/default path 不變。
- 診斷採樣會影響 timing，因此不作 normal gate acceptance，獨立 public-cpu-diagnostics artifact／private filesystem report。原正常 failure 不被重寫。
- scripts/summarize-lighthouse-cpu.mjs 只輸出 CPU 函式／編譯 asset pathname／1-based line-column／self time／長 task timing，不複製 raw trace／DevTools log、headers、cookie、查詢參數、身份或 source body。原始 assets 留在 ephemeral runner、排除於 upload。
- 同一 profile 跨 recorder-thread 的 chunks 應合併，跨 renderer/process 的 node IDs 不混合；Chrome 負的微小 clock jitter 按 installed Lighthouse CPUProfileModel 的 max(delta,1) μs floor，逐筆 adjustment 計數，不能隱藏 partial/missing samples。
- 真 Chrome raw trace initial CLI 在 clock jitter 驗證 FAIL，新增兩項 behavior-red 後再修；實際原 trace 已以 CLI exit0輸出1profile／9520samples／8clock adjustments。沒有把讀取器測試當網站／provider驗收。

## 實際命令

```text
gh run view 37289652737 --repo YNWAforever/hkwtia --log-failed
gh workflow run weekly-lighthouse.yml --repo YNWAforever/hkwtia --ref main -f local_lab=false
gh run download 37309208646 --repo YNWAforever/hkwtia --name production-lighthouse --dir .playwright/lighthouse-production-20261005/linux-repeat-raw
npm.cmd test -- tests/unit/lighthouse-cpu-evidence.test.ts tests/unit/production-lhci-target.test.ts
node scripts/summarize-lighthouse-cpu.mjs
```

讀取器 tests 初版5/5 behavior FAIL，再加真 Chrome格式2/7 behavior FAIL；最終16/16 focused PASS（7CPU＋9canonical resolver）。full gates及Linux profile receipt另記實際完成結果，尚未完成的命令不写PASS。

Rollback：revert本診斷 slice，或保持 capture_profile=false；沒有 schema／deployment／data rollback。既有 HK/SG/RUM／screen reader／staff／policy／provider／worker／identity gates 繼續存在；fullFixComplete=false。

## 2026-10-05 21:44 香港時間 — 已完成的 CPU 診斷及來源 gate

- PR145 的 source `51a6f1bac59dd2d794fd44126e680914ea5cb7e1` 只修改選用診斷 workflow／安全讀取器／tests／evidence，沒有改 app、資料、Auth、payment、worker、flags 或正式配置。原 gate 不變。
- `37313464634` 採樣 run SUCCESS（EN0.91）；`37317327401` 採樣 run FAIL（EN0.75、events0.71）。全部20份 sanitized metrics／CPU rows見 `cpu-diagnostics.json`，samplingCanAffectTimings=true，兩者均不是 normal acceptance。
- 第二個 run 的 `read_` self85.961ms 確認為 `auditor-or-browser-internal`，不是網站 compiled asset；十頁都出現這個內部來源。不能因此宣稱整個 failure 都是 tooling、WAF或硬件問題。最初兩次正常 EN0.88／0.82仍 FAIL_UNRESOLVED；rootCauseConfirmed=false。
- CPU sourceKind 的新 test 先2FAIL（缺字段），第一修正再1FAIL（blob origin繼承），最終17focused PASS（8CPU＋9canonical resolver）。更新 CLI 讀回同一已捕捉匿名 Chrome149 trace：1profile／9520samples／8clock adjustments，沒有新增 browser／provider effect。
- 首次 unrestricted `npm.cmd test` 實際6776pass／596skip／2fail：English async landmark render超原20000ms，後續ZH受late render影響出現24而非12landmarks。保留原failure；未改 app、assertion或timeout。原homepage focused9PASS；同一完整suite以 `--maxWorkers=2` 實際6779pass／596skip／0fail（798pass files／104fully skip files），log也記錄最後8項診斷tests。working tree於run期間由13a到51a，immutable exact-head證據以下列CI為準。
- Exact51a CI `37317330063`：6779unit PASS／596guarded SKIP／0FAIL、worker57PASS、strings／lint／typecheck／build／security／quality通過，七PRchecks含Vercel均成功。本機strings／lint（100warnings、0errors）／typecheck／build exit0；實際commands／時間／初次failure／parser格式限制見 `repository-gates.json`。SKIP不作PASS。
- 原40UC payload不改，22task／28finding／64case／194evidence refs integrity PASS。T15繼續INVESTIGATING；需controlled measured-window cold/warm attribution、原正常gate及HK/SG/RUM／真人驗收。沒有未證實的app optimization、閾值下調或關閉security／authorization。

```text
gh workflow run weekly-lighthouse.yml --repo YNWAforever/hkwtia --ref codex/public-performance-readback-20261005 -f local_lab=false -f capture_profile=true
gh run download 37317327401 --repo YNWAforever/hkwtia --name public-cpu-diagnostics --dir .playwright/lighthouse-production-20261005/linux-source-kind-raw
npm.cmd test -- tests/unit/lighthouse-cpu-evidence.test.ts tests/unit/production-lhci-target.test.ts
npm.cmd test -- --maxWorkers=2
npm.cmd run audit:strings
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
node scripts/verify-full-release-package.mjs
```

本 slice rollback 是 revert source commits／保持 capture_profile=false；沒有新 schema、deployment或資料需回復。正式效能與外部integration／policy／human／release門檻仍未完成，fullFixComplete=false。

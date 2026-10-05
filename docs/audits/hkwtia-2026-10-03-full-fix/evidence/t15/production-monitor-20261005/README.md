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

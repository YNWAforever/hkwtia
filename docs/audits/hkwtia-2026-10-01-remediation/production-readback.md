# 正式環境只讀核對與候選 Preview

本輪沒有正式 migration、部署、付款、退款、發送或 flag 啟用。歷史版本均留在原 receipts；以下只列最新已核對結果。

| 項目 | 最新實際只讀結果 |
|---|---|
| main | `60a272b68c334d256d578ade36d8e24ca3be5485`；GitHub API |
| 正式網域 | `hkwtia.vercel.app`；Vercel deployment lookup |
| 正式 deployment | `dpl_GYj8pTrvHxSZRDszXnVnCtkDS8rV` |
| 正式 source | `e7fa4add247489f525f015007460fb522fb1531b` |
| Target／狀態／region | production／READY／iad1 |
| 正式只讀時間 | 2026-10-02 21:39:19 UTC |
| 正式 ledger／flags／provider | UNKNOWN；沒有可用的只讀 binding，不能從 Preview 推定 |
| 雲端 worker | July26 deployment／version只屬歷史；source、APP_URL、scope、現時排程窗口未驗，沒有 invoke／deploy |

原 July26 deployment `00511ed9-5392-47b8-a256-6d6d87ff4092`／version `67abdfce-e2f3-4964-ad19-3468bf00fd89` 不是本輪候選 worker。`AUDIT_BATCH_WORKER_PAUSED` 是隔離 driver 控制，不證明該雲端 worker 已暫停。

## 最新 Preview runtime 已驗範圍

候選 source `99d5b11974644c06318da4f91d20bf39a8615b9a`；deployment `dpl_EHC8iFrft1EZr3u2efP3ffEVhdzP`／READY／iad1，metadata 2026-10-02 21:53:45 UTC。穩定網址：https://hkwtia-git-codex-full-remediation-8fa44c-ynwaforevers-projects.vercel.app 。應用及 worker 與 `3bc4c136` byte-equivalent；99d5僅修改 native test readiness。

2026-10-02 21:55:17 UTC實際 **17項通過**：唯一 owned synthetic news可見（正向證明 runtime 使用隔離DB）、ledger56、中英 news及AI-Ops serious/critical axe0、六公開頁、匿名需登入、隔離真Auth staff／superadmin及private cache、member拒絕、new-work flags-off仍可讀batch history、既有worker健康錨點。Probe僅archive自己的synthetic news；paymentWrites0/providerSends0。

worker健康錨點可見不代表排程已成功。Google／magic-link並未驗證。Protected Preview browser session私留ignored state，沒有交給worker或放入ZIP。歷史e9fa6d02的15項、d87與3bc的17項另列historical，不冒充99d5。

21:39:16 UTC只讀配置：14新flags false、11項與已確認隔離local值相符、Stripe TEST／email sink／liveWoztell0／worker driver paused；無mutation／secret值輸出。測試account／兩active HKD年價只读確認另附receipt；不是live金流或sender批准。

## 發布邊界

見 release-readiness.md、acceptance.csv及 `docs/integration/2026-10-01-hkwtia-remediation-release.md`。G0隔離branch非primary/default/protected，expiry 2026-10-04 12:00UTC；後續使用須再確認。Google/device／mail recipient、approved provider／unknown effects、cloud service access與兩排程窗口、D01–D06、独立operator SOP、HK/SG/RUM/SLO仍欠證據。本輪正式版本、0052–0056、新flags或canary沒有批准，不推論舊79標誌批准適用。

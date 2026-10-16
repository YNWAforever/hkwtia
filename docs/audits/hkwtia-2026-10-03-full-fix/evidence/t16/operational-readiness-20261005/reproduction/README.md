# 本輪診斷重現資料

這些是 2026-10-05 已執行腳本的非秘密來源快照，不是部署或批准。`verification.json` 保存當次指令、exit code 及結果；同層 JSON 保留原始觀察時間。Production DB、provider、兩個 worker 排程窗口仍未驗收通過。

## 路徑及前置條件

在 owned worktree 的 repository root 執行。把本資料夾的 `production-ledger.mjs.txt`、`access.mjs.txt`、`isolation.mjs.txt`、`worker-observe.mjs.txt` 分別複製到 ignored `.playwright/complete-20261005-{production-ledger,access,isolation,worker-observe}.mjs`。輸出在 ignored `.playwright/complete-20261005/`，不直接覆蓋已提交回執。

- 所有 API 憑證只由既有本機 CLI／ignored env 取得；腳本沒有內嵌憑證。先確認 CLI 帳戶和指定 project／worker，不能換成其他 DB 來解除門檻。
- `production-ledger.mjs` 使用本輪 Windows Vercel CLI 安裝位置；其他裝置須替換 CLI 安裝路徑。僅查指定 Production deployment、單一 DATABASE_URL metadata／其指定 value。敏感值被遮罩即停止，不能改為匯出全部 Production env。只有得到有 provenance 的該值才開始 READ ONLY ledger metadata SQL；不執行 schema migration／fixture。
- `access.mjs` 只做三個 anonymous GET，不附 cookie／bypass secret；Stripe webhook 的 GET 結果只診斷保護層，不是 webhook POST 驗收。
- `isolation.mjs` 需要本輪已由 Neon metadata 核對的 `isolated-neon.json` 複製到 ignored 輸出目錄及既有隔離 `.env.local`。先重新讀回 branch 狀態／expiry；script 拒絕到期、錯 DB/Auth host、缺 sentinel／不符 ledger 或保留合成網域外資料。不得用舊 metadata 代替新 isolation 核對。只執行 READ ONLY 查詢。
- `worker-observe.mjs` 只讀指定 `hkwtia-m3-preview` 活躍版本並 bounded tail 135 秒；不觸發／部署／改 schedule。只保存白名單欄位，丟棄 raw logs。零事件代表未取得兩個已驗證窗口，不代表所有 worker 故障。

上述診斷失敗被記為 `BLOCKED_*`／`NO_VERIFIED_TWO_NATIVE_WINDOWS`；process exit 0 不代表整合 pass。

## Worker bundle 與資源模板

`worker.acceptance.toml.txt` 是本輪 dry-run 配置快照，僅把本機絕對目錄遮罩為 `<OWNED_WORKTREE>`。換成本機 owned worktree 絕對路徑，存為 ignored `.playwright/complete-20261005/worker.acceptance.toml`，再執行 `verification.json` 的 `deploy --dry-run` 指令。allowlist 必須維持 `none`；本配置無 secret。Dry-run 只證明 bundle 可建立，不能刪掉 `--dry-run` 當已批准 deployment。

兩個 `.env.example.txt` 所有值空白，是分開的資源表格，不是實際憑證或批准。Production READ ONLY 來源不能載入測試／fixtures；AI live flags、額度及 test mailbox send 必須先有人明確批准。

遠端操作的待批准範圍見 `operational-acceptance-approval.zh-HK.md`。此來源快照不增加該授權。

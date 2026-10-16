# WTIA 政策決策單（T09）

本文件是待批准決策單，並非已批准條款。工程現況與協會政策分開。現有 `docs/content/hkwtia-policy-copy-matrix.md` 明言它是 editorial control，不能當政策批准。此次未找到可引用的正式會員政策版本；沿用既有授權、付款、past_due 權益及歷史 grant 行為。

| 決策 | 負責人 | 具體待確認內容及可選處理 | 選擇的影響與目前門檻 |
|---|---|---|---|
| D01 續會／到期／寬限 | 會員主管及財務 | 各 plan 的自動續費週期、手動續辦條件、取消即時或期末生效；欠費寬限日數及權益；90/60/30/14 提醒、dunning/winback 的合資格狀態 | 延續現有 recurring 流程，或提供另行批准的手動續辦路徑；須明確列出各 plan 行為。未批准前保留現有 past_due 權益，不自動建立替代訂閱。T08 先提供本人合法帳單及現有付款對帳。 |
| D02 入會審批 | 會員主管 | Community／Startup／Corporate／Patron 分別何時人工審批；付款與批准先後；補件／拒絕代碼；是否承諾處理期限 | 人工批准與收款是獨立事實，組合才可按既有規則啟用。未批准前不增加自動審批或固定 SLA。T10 owner／due／next action 可獨立完成。 |
| D03 特別會籍 | 會長及正式授權負責人 | 明列批准人、執行角色、期限上限／下限、理由與覆核；歷史無期限 grant 的保留或逐筆審理方式 | T06 工程沿用 superadmin 及有限期限契約，弱 comp 入口退役；新政策不能默認撤銷既有歷史權益，也不能用 grant 修補付款。 |
| D04 通訊／支援 | 營運主管 | 各訊息用途、兩個同意資料來源的決定方式、免審 transactional 類別、獨立 reviewer、批准有效期、測試收件人與支援時限 | T07 使用現有不同作者／審批者；內容／受眾／模板改動失效。未批准前不新增免審類別或自動解除 STOP；未知外部效果先對帳。 |
| D05 退款／票務／發票 | 財務及活動主管 | 會員與活動票分開：可退款條件、部分／全額、已簽到處理、席位釋放時機；法律發票名稱／稅務與下載文案 | 活動票退款頁不等於會員退款政策。T16 僅 test-mode 驗證現有退款機制；不推出新正式退款承諾。T08 的 provider 測試不能當 Production 發票法律批准。 |
| D06 發布與日常責任 | 技術負責人及業務 owner | 每個 flag 操作人、正式 canary 身份／範圍、app／worker 排序、監察窗口、回退人、未知效果對帳 owner | 新版本／功能發布門檻保持關閉；先交 PR、Preview、migration／回復演練和 UAT。原 PR105／79標誌／R2 的授權不等於本輪新政策或全 flags 上線授權。 |

## 批准輸入契約

會員主管提交同一份中英內容，附版本、生效時間、批准時間、批准人與批准文件引用。技術負責人將已批准版本加入唯一 server policy registry，記錄內容雜湊，再在隔離環境驗證版本更替與 owner 驗證。測試用政策只存在於測試 fixture，不發布到 registry，也不作協會批准。

沒有批准版本時，政策工程可完成；新政策確認流程不能啟用。既有 checkout 的定價、訂閱、同意與授權規則保持原有行為。正式開啟前需同時具備協會內容批准、當前 registry 版本、Preview 驗收及具體發布授權。


## T22 implementation rulings

- Ruling: skip only a completely absent Auth credential in the server session reader. The installed SDK forwards __Secure-neon-auth cookies; supplied cookies and Authorization still take existing strict provider validation. Configuration remains strict before the shortcut. Cost if wrong: a changed SDK credential contract may require updating this conservative absence check; installed-version evidence and credentialed tests cover the current contract.
- Ruling: every temporary streamed-header control is inert and hidden from accessibility until replacement, while the stable header stays interactive. Real isolated announcement locks prove temporary focus refusal and recovered Enter navigation in both locales; this avoids making users focus a node scheduled for removal.
- Ruling: root client context carries Error only; authenticated Admin/Portal contexts retain the full catalog after their own actor check. Graph discovery and native payload/translation consumers prove current public hooks only require Error. No translation text, legal branding, role, price, consent or membership policy changes.
- Ruling: run the current full unit command with maxWorkers1 to avoid the observed native lockfile subprocess contention. The original18-second subprocess timeout, hostile peer-invalid fixture, full lockfile gate and all assertions are unchanged. The stopped pipeline and guarded skips remain distinct from successful executed checks.
- Ruling: select Lighthouse artifacts by fetchTime >= the run start and assert exactly10 routes. Historical output files must not be relabelled as current; the original simulated thresholds remain unchanged.


Ruling: Reserve 88px plus the safe-area inset beneath the public footer — native desktop hit tests proved the fixed Concierge covered the locale control — costs additional footer whitespace, with four bilingual desktop/mobile pointer and keyboard cases retained.

Ruling: Use the existing next-intl forced locale path with document replace only when switching to the default locale with a fragment — the installed client redirect loses that fragment, while a native HTTP redirect preserves it and updates the same locale cookie — costs a full document navigation for this bounded case; all other switches retain the existing client router and unsaved-editor guard.

Ruling: Store reproduction TypeScript snapshots as `.ts.txt` and copy them back to their documented execution paths — evidence copies must not enter the application TypeScript compilation with broken relative imports — costs an explicit reproduction copy step; no repository typecheck exclusion was added.

Ruling: Native keyboard tests wait for existing controls to be enabled/non-inert before focusing, then prove focus and press Enter — original complete run and credential-free replay showed focus was attempted during intentional stream/hydration protection — costs an explicit readiness assertion, not a guard, timeout or forced-click bypass.

Ruling: Re-run the exact current single full browser collection with5000ms pacing to the confirmed isolated Auth host —2000ms still recorded eight real429s; targeted5000ms real37×200 passed — costs longer isolated verification and is not production performance evidence. Provider quota threshold remains unknown; original failed complete run and reruns stay separate.

Ruling: Perform the final source review sequentially in this chat as requested, with no delegated reviewer — the user selected native sequential execution — costs the absence of an independent second reviewer; all stacked PRs remain drafts for review before merge.


## Exact99 original full native collection: completed, not green

`T22_SOURCE_SHA=99d5b11974644c06318da4f91d20bf39a8615b9a`; `T22_AUTH_PROVIDER_MIN_INTERVAL_MS=5000`; `T22_REPORT_PATH=.playwright/t22-browser-final-single.json`; `node .playwright/t22-run-isolated.mjs .playwright/t22-e2e.mjs --workers=1`. Original498 cases, original timeouts/roles/limiter/provider retained; Windows Node24/built Chromium, confirmed G0 ledger56/Auth, TEST Stripe and email sink. Started2026-10-02T21:57:35.121Z; duration3814668ms. Actual332 pass/4 unexpected/162 genuine skips/0 flaky/0 collection errors. Native receipt `evidence/t22/browser-99-single.json` and per-case skips; actual Auth597×200/3×429, observed get-session max rolling60seconds13, quota threshold unknown/no Retry-After. This observer does not count every Auth path and cannot infer a threshold.

CMS line331 timed out during other editor's private rebase after explicit publication/revert; previous public state was restored. Read-only reconciliation at23:03:22UTC proves2 owned published versions and equal effective overrides; one synthetic editor's open private draft retained, no raw cleanup/history deletion. Negative role matrix line244 and CMS line331 exceed180seconds under5000ms pacing, no429 within those cases. C2 wizard line275 shows safe app error boundary in the same window as1×429; D4a sign-in/protected probe failed in a window with2×429. These are timing/provider observations, not permission to disable Auth or claim a database cause. The same unchanged original cases passed at3bc/2000ms; fresh exact99 targeted replay is recorded separately.

Operator gate: Neon/Auth owner must confirm isolated quota scope/window/reset or dedicated acceptance capacity before a new complete run. Redacted branch/config readback exposes no numeric quota setting. A proposed split of the role matrix was not applied: it would not resolve the sustained provider constraint or CMS timeout. No retry of an unknown payment/publication effect, test timeout increase, skipped assertion or production flag change.


### 原條件定向驗證

Original四個失敗案例在exact99、2000ms、原180秒timeout、原完整role matrix及真provider下定向重跑4 pass/0 fail/0 skip；90×200/0×429。CMS62435ms、negative role95997ms、wizard28402ms、en TEST checkout11045ms。程式/斷言/timeouts沒有改動；原332/4/162仍保留，不能合併為單次完整綠燈。 證據：`evidence/t22/browser-99-targeted.json`、`browser-99-failure-disposition.json`；完整quota/readback gate仍在。

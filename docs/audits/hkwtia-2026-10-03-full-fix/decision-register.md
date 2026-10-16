# Oct3 decision register

Original D01-D06 wording and owners below are copied without new approval from ../hkwtia-2026-10-01-remediation/policy-decisions.md. None has a newly approved version in this session. Proposed implementation defaults are configuration, not association policy.

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



## Execution rulings

- The human request authorizes implementation and isolated testing; the supplied plan sentence saying it authorizes only plan writing describes its document-creation turn. It does not override this implementation request.
- Native sequential execution is explicit; no delegated reviewer or agent is used.
- Reuse the owned clean worktree on a new branch, preserve ignored historical evidence and test credentials, and leave root dirty files untouched.
- The existing parseLoginDestination owns returnTo; do not add parallel routing. Existing page-copy/news private drafts and worker health remain authoritative.
- Current production is now 36ebae1; older e7fa production readback remains historical evidence. No deployment mismatch inferred.

## T10 implementation rulings — 2026-10-04

- PR136 sourcebe77a3a7, harnessd060f423; unchanged runtime bytes and current build proven. Sequential author self-review honors user no-agent request; remaining minor state/due labels recorded in evidence/t10/self-review.json. Independent human review remains stronger.
- `/admin/ai-review` is a new route over existing immutable draft/review/work/budget stores; existing `/admin/tasks?draft=` and T18 search/owner/reopen remain authoritative. No new approval/sender system or migration.
- Optional browser recovery is off by default. Independent key, explicit flag, authenticated session/conversation binding and configurable60..3600sec provide engineering protection; TTL is not association policy. Preview testing may enable synthetic recovery; Production activation needs owner decision.
- Final actual all59 PG21, native2 actual password Auth/EN-HK390/keyboard/axe0, exact CI6683pass540skip/worker57/all7, local full4workers6683pass540skip0fail. Default-worker repository scan timeout preserved as a failed attempt; deadlines were not increased.
- Preview credential/config changes were branch-scoped and expressly authorized for isolated test acceptance. AI generation/provider approval remain false, agentsfalse/caps0; no actual model/sends/payment/Production. T13 and identity/worker/staff gates remain open.

- T10 final Preview19 passed2026-10-04T08:55:20Z, source d060/dpl_ELFx9FrAXc4JA6sJq2Ra2MXimC4E. Actual EN/HK review/adopt0outbound/protected compose/390/axe0; final receipt supersedes failed harness attempts. Native2 and all19 checks use actual isolated DB/password Auth; no real AI provider or sender delivery claim.

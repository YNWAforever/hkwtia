# 分能力發布單（T16）

狀態：工程與隔離驗收證據整理中；正式發布、啟用及一週試點尚未執行。以 release-manifest.json 的實際 source / deployment / ledger 為準。main 合併批准仍有效；歷次正式發布批准只涵蓋當時指定版本與範圍。

## 能力與門檻

| 能力 | 程式／隔離證據 | 正式啟用前必要證據 | owner |
|---|---|---|---|
| 安全503、人工入會／聯絡、登入入口／返回 | T01/T14A；真密碼 Auth、角色及本機503 | 正式獨立 CONCIERGE_COOKIE_SECRET presence；配置驗證；指定版本發布批准；Google/magic各自仍待實際驗證 | Release owner / Auth owner |
| 職員工作台、搜尋、Member360、CMS人工草稿 | T17/T18/T15；真DB、390/1440、鍵盤、CAS、私有資料隔離 | 3–5職員任務、真 screen reader、内容 field-level批准；現有手動功能與政策維持 | WTIA operations/content |
| Worker readiness／批次八操作 | T02/T03；48實際DB回歸、50/500/5000及CAS/claim | 精確 isolated cloud worker revision/service binding/APP_URL；每個啟用 job 兩個實際窗口；逐操作 flag/approval/provider gate | Worker operator / operations |
| 正常入會／續會／付款修復／有限grant | T14B；DB/本人授權／既有Stripe TEST記錄 | 真Google/magic；remote signed webhook/recurring receipt；D01–D03批准版本；正常付款修復與特別會籍分開 | Finance / membership |
| 活動checkout／票券／退款／通知 | T14C；真Stripe TEST、本機簽署回放及DB | remote webhook、測試provider真回執、refund政策及逐能力發布批准 | Events / finance / provider owner |
| Inbox／campaign／sender | T14D；真SQL/consent/current facts/未知效果防重試 | 允許測試收件人、核准模板、真accepted/delivery/echo、兩個worker窗口 | Messaging owner |
| Application/support/renewal/board/content AI | T05–T13；離線70×3、最終正文與預算/knowledge/draft CAS | 具體provider/資料/purpose/spend批准、有效定價、實際T13 provider及兩名獨立reviewer；D04–D06政策 | AI/data/policy owners |
| OpenCode Go行政adapter | 關閉 | 行政資料政策、官方protocol/endpoint/pricing及adapter評測；可明確不採用 | AI/data owner |
| 公開與私有效能 | T15真实1k/10k SQL/EXPLAIN；本機／Preview lab | 原Lighthouse全部門檻；HK/SG各三次冷暖與網絡設定；足量RUM與人工任務 | QA / operations |

## 執行順序

1. 簽署版本、能力、target、owner與rollback單；重新讀回Production alias/source、ledger hashes、web/worker binding及 flags。保留唯一現有 superadmin；不合併同電郵身份。
2. 從已批准備份建立隔離restore副本並核對hash/ledger/核心資料；新schema先保持新writer/dequeue关闭。0057–0061只在另外批准正式migration後使用現有 `npm run db:migrate`。不使用seed、fixtures或清理命令於Production。
3. 以正式配置及closed flags建置Production candidate，記實際deployment/source/region/secret presence。驗證它的runtime指向已批准Production來源。隔離Preview的DB/Auth配置只用於隔離驗收。
4. 發布相容web安全降級／入口，再部署service身份與scoped worker。僅在精確版本及兩窗口已證實時開相應job；`AGENTS_ENABLED`維持false直到AI必要門檻全通過。
5. 先開核准的無副作用UI，然後export/profile_patch；import、finite grant、communication、tickets逐項核對自己的approval/provider/政策/worker gate。`ADMIN_BATCH_ENABLED`不能替代operation旗標。
6. AI初期只application/support，兩名staff、每天50宗、draft-only一週；每個purpose通過T13才可開。review不發送，send另取actor並重驗facts/consent/approval。renewal/board/content分批批准；Go保持off。
7. 每階段由核准合成身份／允許對象smoke，監察5xx、queue lag、unknown、cost/grounding、重複effect與金額／權益。重大異常按rollback.md立即pause並先對帳。
8. 一週後兩名reviewer／3–5職員核對time-on-task、rework、完成率、policy版本與provider帳單。沒有樣本的ROI、區域效能與operational結果維持unknown。

## 指令邊界

正式批准後，使用既有secret store載入 DATABASE_URL（不打印），執行 `npm run db:migrate`，讀回 drizzle ledger 並核對manifest。web/worker部署使用既有linked project与worker release pipeline，保存其版本回執。精確Production deployment ID尚未建立，因此本單沒有聲稱可執行某個已驗證production promotion。禁止將隔離測試配置當正式配置发布。

## 2026-10-05 最新正式環境讀回（取代先前36eb的當前狀態）

- 正式 alias 已指向 ed550b96 / dpl_7kPgC4PcwHcP6Q9fWFaVTYgkvVFV，READY、main ref、source=redeploy。這是本次檢查前已有的部署；本 execution 沒有發布、migration、flags 或 provider mutation。
- 配置及 runtime 分開：CONCIERGE_COOKIE_SECRET 未配置；AGENTS_ENABLED 未在該部署 env 名稱清單。正式 API 實際回安全503 AI_DISABLED，並非 AI 正常回答成功。獨立 cookie secret、provider/budget/purpose批准仍是啟用門檻。
- 新 native receipt 見 evidence/t16/production-20261005/browser-final.json：4個EN/HK1440/390安全降級＋10匿名頁面＋2fresh locale context admin guard，共16項。沒有使用會員登入 cookie、沒有建 fixtures、沒有請求登入連結、沒有付款／退款／訊息／AI provider。
- Production DATABASE_URL 在指定部署 API 被遮罩。只讀 ledger checker 以 BLOCKED 停止，0 SQL query；沒有讀完整Production env、沒有以測試 DB 代替、沒有執行 migrations。解除條件：Release/DB owner 提供 provenance 已核對、只讀連線／既有secret-store路徑，或提交当前 ledger hashes。
- 隔離 branch br-lingering-unit-azxl75s5 新讀回仍 ready/nonprimary/nondefault/unprotected，2026-10-05T12:00Z（香港20:00）到期；Google／允許測試mailbox、worker服務身份／兩窗口、provider receipts、人工／政策／区域／pilot仍需原各owner。
- 原始40UC、舊Production與測試回執保持其歷史時間。部署已觀察到不等於新能力已批准／啟用／operational；fullFixComplete仍false。

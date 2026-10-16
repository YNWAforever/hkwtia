# HKWTIA 剩餘真整合驗收 — 具體授權及資源單

日期：2026-10-05。工程基礎：main 4da4bc590dc984768bd87b1f597dfde96c81593a；已合併修復及 repository gates 保留。這是執行前的具體副作用範圍，不是新實作計劃，也不是完成回執。

## 已核對

- 既有隔離 alias：hkwtia-usability-20261003.vercel.app；部署 dpl_CaFyCEuC6pewkfG2Bg3Z6hr277FR/source946bad06。正式 alias 不列入本測試範圍。
- 本輪 anonymous GET 對登入、Stripe webhook、jobs入口均回302 Vercel登入層；外部worker／provider不持有 browser cookie，不能把受保護入口當可達。
- 對單一 Production-scoped DATABASE_URL 官方API讀回仍無可用值（type=sensitive）；0 SQL/0 migration。缺少有provenance的既有只讀連線，不能猜一個Neon branch。
- Worker acceptance bundle 已 native dry-run，10.80KiB/gzip3.32KiB；APP_URL 為上述隔離alias，WORKER_REVISION為4da4bc59，scope=none。未部署，未上傳secret，未觸發job。
- Existing cloud worker仍67abdfce；bounded passive tail沒有兩個已驗證排程窗口。沒有改排程／憑證或手動觸發，無結果不代表全部job失敗。

## A — 隔離遠端 webhook／worker 驗收（待批准）

1. 僅把 hkwtia-usability-20261003.vercel.app 暫時加入 Vercel Deployment Protection exceptions；保留原有其他例外及project protection。應用Neon登入、actor、角色、approval、同意與server authorization不變。
2. 沿用既有 workers/wrangler.acceptance.toml 系統，僅在 hkwtia-remediation-acceptance-20261001 部署相同reviewed worker runtime。提供獨立且僅屬此隔離Preview的CRON_SECRET到該Cloudflare worker；不提供DB、Auth cookie、R2、Production secret或browser cookie給worker。
3. 起始allowlist=none；接著逐job只允許本次已正向核對、已備妥owned synthetic fixture的scope。web端WORKER_HEALTH_REVISION／cron服務secret亦只改此Preview branch。AI及真sender保持關閉；sender sink結果不充作真provider送達。
4. 在Stripe TEST帳戶建立owned webhook endpoint，URL僅為隔離alias /api/webhooks/stripe；其test signing secret只交給現有hkwtia的此Preview branch。保留其他Stripe endpoints與Production設定。用owned synthetic customer/subscription/testclock與hosted test付款證實remote自動簽署回呼、冪等、正常續會與已付款權益，不用comp修付款。
5. 每個實際啟用job取兩個native scheduled windows，匹配app/worker SHA、服務身份、poll記錄與owned effect/audit；觀察或模擬事件不冒充端到端成功。未知provider效果先對帳。
6. 最後關此測試worker的dequeue/schedule，停用owned Stripe endpoint，恢復新增的Preview protection exception與本次改動的branch-only secret配置；保留測試回執、claims、audit與未知效果。不得修改hkwtia-m3-preview現有worker、Production、其他endpoints或資料。

Approval僅涵蓋以上isolated remote integration。Production migration0057–0061、正式啟用、真會員發送及真付款／退款均另有明確門檻。

官方機制：[Vercel Deployment Protection exceptions](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/deployment-protection-exceptions)。如當前account不能設定單一domain exception，保留保護並停此access步驟；不自行改為全project unprotected或把project-wide bypass secret交給其他provider。

## B — 真AI合成評測（待批准）

先前 eval:admin:live 被自動審批拒絕，理由是外部AI資料及費用範圍未明確批准；本轮沒有繞過或重試。

提請批准：只把現有70題合成golden corpus的 application/support/renewal/board/content 與合成來源事實，送到OpenAI官方API，以registry既有 openai:gpt-4.1-mini 做每題3次（210 observations）。現有public Concierge25題及synthetic KB embedding需要另外明確批准，不能由70題行政評測的批准推定；追加驗證仍受同一總cap及既有budget／用途guard限制。No real member PII、payments、identity merge、sends、publishing或Production flags；OpenCode Go保持off。

提議總額／本run／當日／當月各不超過US$5（5,000,000microusd），不是默認獲批。guard／預留／receipt／unknown任何一項不成立就停，不增加cap或盲重試。現有T06 durable budget與T13明確live guards仍必須通過。

官方gpt-4.1-mini定價讀回：每1M input US$0.40/cached input US$0.10/output US$1.60；[模型頁](https://developers.openai.com/api/docs/models/gpt-4.1-mini)。啟用前再次核對，不能只填pricing version冒充核對。不得拿Go／coding憑證代替行政API key。

缺少專用OPENAI_API_KEY及具體上述data/purpose/spend批准。Provider runtime結果通過後仍需兩名獨立blind reviewer和指定一周staff pilot，不能由此文件取代真人驗收。

## C — 缺少的資源（只提供本機檔案路徑）

### 正式DB只讀：獨立ignored env檔

PRODUCTION_DATABASE_URL_READONLY：由DB operator確認是目前Production project的來源，附provenance／secret-store引用。只用ledger/schema metadata READ ONLY檢查，從不由此檔載入fixtures、seed或測試provider。勿放在測試.env.local，也勿在聊天貼值。

### 隔離Auth／provider：另一ignored env檔

- AUTH_ACCEPTANCE_GOOGLE_EMAIL：本人控制的專用Google測試帳戶；人員完成device/passkey challenge，不傳登入token或cookie。
- AUTH_ACCEPTANCE_MAGIC_EMAIL：本人控制的測試mailbox；AUTH_ACCEPTANCE_EMAIL_SEND_AUTHORIZED=true必須有人的明確允許。合法/過期/replay/重寄/跨裝置均需真link。
- OPENAI_API_KEY：只限上述已批准purpose/spend的行政eval專用key；用途與額度批准不以key存在代替。
- 不提供Google密碼到PR／evidence；不輸出任何秘密、登入連結、完整callback網址或PII。

只有部分資源準備好也可繼續相應任務。未回覆／未批准不能當作批准。既有Pricing、past_due、refund、membership及D01–D06新政策、content field signoff和3–5人staff／screenreader／兩週baseline／HK-SG RUM／一周pilot的owner責任仍保留。

# T05：核准 provider 路由及停用界線

## 已實作

- 沿用同一 Agent runtime、authenticated actor、guarded tools、member Writer quota、run lifecycle 及 SDK7 `result.usage` aggregate。四類既有 agent 均先經 server registry；Retention 對應 renewal，Board 對應 board。
- Client concierge payload 保留 strict schema，拒絕 model/provider/baseURL/registry。Server 路由亦拒絕额外欄位、未核准模型／用途、錯誤 protocol、未知價格版本、缺少工具或 JSON 能力。
- OpenAI Responses／Chat Completions、Anthropic Messages 用原有安裝版 SDK；沒有更新 framework、SDK、lockfile、身份或付款架構。
- 初始輸入及每個 SDK step 都檢查包括工具 JSON schema 的保守 UTF-8 byte admission；不是精確 tokenizer 或成本估算。輸出／timeout 用 SDK 真正的 options；重試固定 0，不自動 fallback。
- SDK 429 原錯誤現可傳到 runtime 的安全 `rate_limited` 分類；timeout 不重試。工具錯誤仍優先保護 actor／tool boundary，不記錄 provider 的 raw 文字或秘密。

## 驗證範圍

先有 7 個路由行為 RED，再有 2 個輸入上限 RED；真 SDK mock HTTP contract 找到 1 個 429 分類 RED。Focused 共 209 pass／12 files／0 skip，包括舊 actor、prepared-run、guarded tools 回歸。三 protocol 使用真正 SDK 建立請求、解析 SSE、執行工具；兩步用量累計 input=4／output=2。這些是 mock endpoint contract，**沒有真 provider receipt**。

## 配置與用途

| 能力 | Server 預設 | 目前限制 |
| --- | --- | --- |
| Concierge／member Writer／既有 Retention／Board | 保留原有兩個已定價模型；原有 enabled/role/quota 仍有效 | 原有價格值保留；`legacy-2026-10-03` 是 repository snapshot，T06 尚須核對官方計費版本 |
| Application／Support／Content 新用途 | closed | 完成相應 task 的 facts、資料 scope、覆核與部署門檻後才可設定 |
| OpenCode Go coding | 本程式沒有改動或採用 | coding 的使用資格不等於行政資料用途批准 |
| OpenCode Go administrative runtime | **disabled，所有 constructor／route 都拒絕** | 沒有用途／模型資料政策的批准；有 key 亦不會啟用 |

保留獨立 key 名稱 `OPENCODE_GO_API_KEY`，沒有讀取或傳送 Go key，也沒有冒充 user agent。實作規格的 reserved base 為 `https://opencode.ai/zen/go/v1`，沒有任何 dispatch。現時可用的是已核准 OpenAI／Anthropic adapters；Go 關閉不阻擋人工操作或其他工程。

2026-10-03 再查官方 [Go 文件](https://opencode.ai/docs/go/) 及 [Zen 文件](https://opencode.ai/docs/en/zen/)。Go 官方定位 coding-agent traffic，要求真實 client UA 及 stable session；protocol／價格／privacy 按 model 區分且可變。這不是 WTIA 行政用途的批准。若未來採用，AI owner／privacy owner 須留下用途、允許資料、retention、pricingVersion、模型能力及協定批准；工程才可加入實際核准 catalog 並另跑 provider acceptance。

## 下一個門檻與回復

T06 必須完成原子每 run/day/month reservation、unknown／部分輸出成本對帳，按規格施加 task output caps／20 秒 deadline。T05 不宣稱這些已成立，也不把 SDK 未報 usage 當免費。沒有新增 migration、Production flags、provider send 或付款。回復時停新 AI 工作並回復 app；保留既有 run/audit/history，unknown 外部效果先對帳。正式發布仍走 T16 capability matrix。

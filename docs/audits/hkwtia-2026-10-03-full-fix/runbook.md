# 繁中每日營運／交接（T16）

## 開班

1. 使用自己的Google／magic或已驗證登入方式；登入成功與會員profile、申請、會籍、公司席位、payment分開。沒有相同電郵自動合併權限。
2. 讀worker health的版本、最近receipt及unknown；沒有觀察值顯示unknown，不當成全部job故障。核對有沒有paused writers/dequeue與待對帳effect。
3. 從工作台查看mine/unassigned／due／needs-information；先read→draft→review，只有擁有權限且facts、同意與approval仍有效才commit/send/publish。

## 會員與財務

- 正常續費、已付款未啟用的付款修復、特別會籍分開處理。付款修復查實Stripe receipt與冪等job，不用comp代替；歷史NULL/NULL grants保留。
- Member360核對profile、Auth identity、申請、會籍、company seats和payment。身份綁定用已驗Auth id；權限server重新取得actor。
- D01–D03未有批准版本時沿用現有pricing/past_due/refund/有限grant審批。新defaults為config，不當協會條款。

## 批次與通訊

- 分群先檢查繁中條件和keyset分页；說明selected-page與跨頁scope。固定snapshot→previewDigest→CAS再commit；不用當前畫面代替完整preview。
- 八種既有operation逐一依flag/approval/lease/provider gate；50/500/5000的合成回歸不等於正式發送批准。
- 取消只停後續工作；部分失敗逐項檢查。accepted-timeout/unknown保留，provider對帳後才決定resume；不因TTL重送或退費。
- 同時核對兩個consent store、locale/template批准及當前facts；AI review與send分開。參閱 delivery-recovery-sop.zh-HK.md。

## CMS與AI

- 使用既有server草稿與revision/CAS，Browser Back/Forward保護未存內容；發布前檢查中英及手機。只有正式批准內容可發布。
- AI只起草／分類／摘要／翻譯，facts由DB與approved policy提供。看最終正文、來源、生效時間及模型／prompt／policy版本；無AI仍可完成正常人工流程。
- 試點每天≤50宗／兩名staff／draft-only一週；沒有T13真provider與盲評批准的purpose保持off，Go行政adapteroff。

## 收班與交接

- 記operationId、個案狀態、需補件、unknown effect、成本hold、policy版本與負責人。log/PR不放PII、token/cookie/keys。
- 核對當日新claims/outbox與provider receipts；交接先對帳再retry。僅報實際pass/fail/skip/blocked；未觀察資料用unknown。
- 詳見 operations-handbook.md、admin-usability-sop.zh-HK.md、application-followup-sop.zh-HK.md、support-draft-sop.zh-HK.md、retention-draft-sop.zh-HK.md、content-draft-sop.zh-HK.md、knowledge-runbook.zh-HK.md。
- 三至五位職員須獨立完成補件、回覆與50筆preview／failure recovery，另有screen-reader與HK/SG/RUM驗收。自動axe0不代表全WCAG或真人試點通過。

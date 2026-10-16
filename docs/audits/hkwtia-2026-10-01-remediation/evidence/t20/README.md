# T20 公開內容與入口驗收

Application source: `f327fd334e7766b22102154bf1959310b658ab78`；既有登入入口、public predicates、membership catalog及79夥伴資料保留。唯一產品文字變更：Partners.sourceNote.title中英介紹標題。

## 已執行

- 目標行為 RED：Partners真component中英原標題不符合公開介紹；2 fail／4 pass。最小兩個message值修改後綠燈。
- focused：77 pass／0 skip／0 fail／7 files。會員server catalog、公開頁catalog、events publication/demo predicate、featured events、Partners、中英shell及mobile navigation。
- `npm.cmd run build`：exit0；Next16.3.6、267 pages。未更換框架、Auth、Stripe、R2、roles、政策或price ID。
- `node --env-file=.env.local .playwright/t20-browser.mjs`：4 pass／0 skip／0 fail，34.3s；真built loopback +確認隔離Neon/Auth。中英匿名header/footer keyboard、390px menu/escape focus、existing staff redirect；Partners79實際lazy images各有naturalWidth>0，58／15／6；公開合成活動可見，members_only及已published/public的demo完全排除。
- 四個1440/390 screenshots；已檢視zh390。partner website只驗證所有已rendered目的地為HTTPS及無URLcredentials，未冒充79外站HTTP可達。
- 原Production匿名只讀四頁200；兩locale79及入口存在，舊標題仍存在。這不是candidate在Production驗收。

## 真實限制及 harness 修正

初次menu在hydration前操作未開啟；改為390 viewport後goto並等待networkidle才鍵盤操作。R2本機missing導致圖片失敗；恢復先前已批准的同bucket/default的五個runtime值後實際79讀取通過，沒有provider寫入或secret upload。活動卡片有兩個合法連結，原exact1 locator assertion失敗；改驗證公開活動連結可見，私人/demo仍zero。

測試檔在application commit後改readiness、相對日期及locator；`gates.json`記錄測試檔hash。functional app SHA沒有偷偷改標籤。這些harness/environment失敗均不算產品RED。

全suite/lint/type/strings/最終build於T21/T22 aggregate gate更新，這裡不稱已在此SHA完成全部門檻。D01–D06政策/content approval、Production CMS override DB核對、外站HTTP、完整U59financial報表、Google/mail provider及Production候選發布仍待各owner。看content-signoff.md。

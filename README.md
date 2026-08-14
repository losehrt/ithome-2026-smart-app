# SMART on FHIR 範例程式

用瀏覽器原生 JavaScript 寫的 SMART on FHIR app，沒有打包工具、沒有框架、不需要 Node.js。

## 這是什麼

這些程式碼重走了一次「火線超人」的路。火線超人是一套已經在跑的醫療資料應用，用 Rails 寫的，接真實的醫院 FHIR 伺服器。這裡把同一套協定用最多人會的技術再實作一次。

換語言不是因為 Rails 做不到，而是想證明一件事：**要參與醫療資料互通，不必先成為醫療資訊工程師。** 你會 Web、懂 HTTP、寫得動 JavaScript，就足以做出一個符合國際標準的 SMART on FHIR app。

SMART on FHIR 是國際通行的醫療資料交換標準，台灣也正在推。這個領域長期被當成醫院資訊室的專業，門檻其實沒有那麼高，缺的是有人把路走一遍給你看。

程式碼出自 2026 iThome 鐵人賽的[一個系列](https://ithelp.ithome.com.tw/users/20183398/ironman/9100)，隨文章進度更新。每個資料夾對應一篇文章，也各自有一個同名的 git tag。

## 怎麼跑

任選一個資料夾，起一個靜態伺服器就好：

```bash
cd day06-smart-discovery
python3 -m http.server 5173
```

瀏覽器開 <http://localhost:5173>，按 F12 看 console。

不能用 `file://` 直接開 `index.html`，`type="module"` 的檔案會被 CORS 擋掉。

## 目前有哪些

每一天一個資料夾，各自是一份完整可跑的專案，讀到哪一天就進那個資料夾，不用回頭拼湊前幾天的檔案。

| 資料夾 | 對應文章 | 內容 |
|---|---|---|
| `day04-sandbox-setup/` | day04 開發環境準備 | 連上公開 FHIR server，畫面顯示「連線成功：Patient/…」 |
| `day06-smart-discovery/` | day06 SMART Discovery 與能力探索 | 新增 `discovery.js`，問出授權端點與 token 端點 |
| `day09-first-authorization/` | day09 從頭跑完一次授權 | 再加上 `pkce.js` 與 `auth.js`，走完一趟 standalone 授權，console 印出 access token 與 patient id |
| `day12-launch-context/` | day12 解析 Launch Context | 換用 `fhirclient`，`app.js` 整份替換成三十行不到的版本，畫面從 patient id 變成病人姓名與生日。其餘五個檔案與 day09 一字不差，`discovery.js`、`pkce.js`、`auth.js` 不再被引用但留著 |
| `day14-token-lifecycle/` | day14 Token 的生命週期 | 第二幕終態，只剩 `index.html`、`app.js`、`vendor/` 三樣。`SCOPE` 加上 `offline_access`，多一顆按鈕手動換 token，並把用過的那張 refresh token 再送一次看伺服器收不收 |

系列還在進行中，後面的資料夾會隨文章發布陸續加進來。

day01 到 day03 與 day05 沒有可跑的專案，那幾篇是 FHIR 資源與 HTTP 請求的範例片段，直接讀文章即可。day07 全程在瀏覽器網址列上操作，一個檔案都不用動。day08 新增的 `pkce.js` 跑起來畫面與 day06 一樣，那一篇的驗證是在 console 裡做的，要對照參考寫法就看 `day09-first-authorization/pkce.js`，內容完全相同。

day10 與 day11 也沒有各自的資料夾。兩篇的跟著做都是改 `auth.js` 裡 `SCOPE` 那個常數的值再重跑，day10 看同意畫面多幾行、day11 看 token response 少哪些欄位。檔案組成與 `day09-first-authorization/` 相同，開那一份改 `SCOPE` 就能重現兩篇的每一次實驗。

day13 也沒有。那一篇在 `app.js` 裡加幾行讀 `id_token`，但跟著做的第四步是換成醫護身分再跑一次，收穫是兩種身分之下 `fhirUser` 指向的資源型別不同。任何一份靜態資料夾都只能凍結其中一次。開 `day14-token-lifecycle/` 就有那幾行讀 `id_token` 的寫法。

## 跑之前要先改一行

下面這些檔案裡的 FHIR base URL 帶著一串 `/sim/` 編碼，那是模擬設定，每個人不一樣：

| 檔案 | 常數 |
|---|---|
| `day06-smart-discovery/app.js` | `FHIR_BASE_URL` |
| `day09-first-authorization/app.js` | `FHIR_BASE_URL` |
| `day12-launch-context/app.js` | `FHIR_BASE_URL` |
| `day14-token-lifecycle/app.js` | `FHIR_BASE_URL` |

到 [SMART Health IT Launcher](https://launch.smarthealthit.org/)，Launch Type 選 **Patient Standalone Launch**，複製 **Server's FHIR Base URL** 欄位那一整串貼上去。沒換的話抓不到端點，授權也會被授權伺服器擋下來。

`day04-sandbox-setup/` 不用改，它連的是 `https://r4.smarthealthit.org`，不需要授權。

## 資料都是假的

範例連的是 SMART Health IT 的公開 sandbox，裡面的病人由 [Synthea](https://synthetichealth.github.io/synthea/) 合成，不是去識別化的真人資料。

那是公開的測試環境，**資料是共用的**，任何人寫進去的東西大家都看得到。

**絕對不要放入真實病人資料，一筆都不要**，包括拿真人的姓名或生日去測試。

## 授權

這個 repo 的程式碼採 [MIT 授權](LICENSE)，可以自由取用、修改、放進你自己的專案。

**`vendor/` 底下的檔案不在這個 MIT 授權的涵蓋範圍**，它們是第三方的作品，各自帶著自己的授權條款：

| 檔案 | 版本 | 授權 | 來源 |
|---|---|---|---|
| `vendor/fhir-client.pure.min.js` | 2.6.3 | Apache-2.0 | [smart-on-fhir/client-js](https://github.com/smart-on-fhir/client-js) |
| `vendor/fhir-client.pure.min.js.LICENSE.txt` | — | MIT | 上面那支檔案打包進去的第三方程式碼授權聲明，由它開頭的 banner 指名 |

這兩個檔案已經下載進版控，clone 下來不需要網路就能跑。要自己重抓的話：

```bash
curl -o vendor/fhir-client.pure.min.js \
  https://cdn.jsdelivr.net/npm/fhirclient@2.6.3/build/fhir-client.pure.min.js

curl -o vendor/fhir-client.pure.min.js.LICENSE.txt \
  https://cdn.jsdelivr.net/npm/fhirclient@2.6.3/build/fhir-client.pure.min.js.LICENSE.txt
```

`day04` 到 `day09` 這三個資料夾都還沒用到這支 client，`day12-launch-context/` 才正式換過去，整份 `app.js` 靠它重寫。

import { discoverEndpoints } from './discovery.js'

// day04 的值：'https://r4.smarthealthit.org'
// 下面這串請換成自己的：到 SMART Health IT Launcher 選 Patient Standalone
// Launch，複製 Server's FHIR Base URL 欄位那一整串（含 /sim/ 的那個）。
// sim 後面的編碼每個人不一樣，抄這裡的值後面幾天會一路錯下去。
export const FHIR_BASE_URL =
  'https://launch.smarthealthit.org/v/r4/sim/WzMsIiIsIiIsIkFVVE8iLDAsMCwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0/fhir'

const result = document.querySelector('#app')

discoverEndpoints(FHIR_BASE_URL)
  .then((endpoints) => {
    console.log('authorize：', endpoints.authorize)
    console.log('token：', endpoints.token)
    console.log('PKCE 方法：', endpoints.pkceMethods)
    console.log('capabilities：', endpoints.capabilities)
    result.textContent = `找到授權端點，共 ${endpoints.capabilities.length} 項能力`
  })
  .catch((error) => {
    result.textContent = `discovery 失敗：${error.message}`
  })

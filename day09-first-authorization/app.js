import { discoverEndpoints } from './discovery.js'
import { startAuthorization, readRedirect, completeAuthorization } from './auth.js'

// 下面這串請換成自己的：到 SMART Health IT Launcher 選 Patient Standalone
// Launch，複製 Server's FHIR Base URL 欄位那一整串（含 /sim/ 的那個）。
// sim 後面的編碼每個人不一樣，抄這裡的值授權會失敗。
export const FHIR_BASE_URL =
  'https://launch.smarthealthit.org/v/r4/sim/WzMsIiIsIiIsIkFVVE8iLDAsMCwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0/fhir'

const result = document.querySelector('#app')
const connectButton = document.querySelector('#connect')

main().catch((error) => {
  result.textContent = `出錯了：${error.message}`
})

async function main() {
  const endpoints = await discoverEndpoints(FHIR_BASE_URL)
  const redirect = readRedirect()

  if (redirect.error) {
    result.textContent =
      `授權沒有完成：${redirect.error}（${redirect.errorDescription ?? '沒有進一步說明'}）`
    return
  }

  if (!redirect.code) {
    result.textContent = '準備好了，按按鈕開始授權'
    connectButton.disabled = false
    connectButton.addEventListener('click', () => {
      startAuthorization({ endpoints, fhirBaseUrl: FHIR_BASE_URL })
    })
    return
  }

  connectButton.remove()
  result.textContent = '正在用 code 換 token…'

  const token = await completeAuthorization({ endpoints, redirect })

  window.history.replaceState({}, '', window.location.pathname)

  console.log('access token：', token.access_token)
  console.log('patient id：', token.patient)
  console.log('scope：', token.scope)
  console.log('expires_in：', token.expires_in, '秒')

  result.textContent = `授權完成，patient id 是 ${token.patient}`
}

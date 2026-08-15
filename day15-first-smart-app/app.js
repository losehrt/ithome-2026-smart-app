import { summarize } from './patient.js'

// 換成自己的：到 SMART Health IT Launcher 選 Patient Standalone
// Launch，複製 Server's FHIR Base URL 欄位那一整串（含 /sim/ 的那個）。
export const FHIR_BASE_URL =
  'https://launch.smarthealthit.org/v/r4/sim/WzMsIiIsIiIsIkFVVE8iLDAsMCwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0/fhir'

const CLIENT_ID = 'my-smart-app'
const SCOPE = 'launch/patient patient/Patient.r openid fhirUser offline_access'

const status = document.querySelector('#status')
const connectButton = document.querySelector('#connect')
const details = document.querySelector('#patient')

// 第二個參數只接 ready() 自己的失敗，也就是還沒授權。
// 寫成 .then(showPatient).catch(offerConnect) 的話，
// showPatient() 裡的讀取失敗也會掉進 offerConnect()，
// 畫面會叫使用者去按一顆已經被移除的按鈕。
FHIR.oauth2.ready().then(showPatient, offerConnect)

function offerConnect() {
  status.textContent = '還沒授權，按下面的按鈕開始'
  connectButton.hidden = false
  connectButton.addEventListener('click', () => {
    FHIR.oauth2.authorize({
      iss: FHIR_BASE_URL,
      clientId: CLIENT_ID,
      scope: SCOPE,
      redirectUri: window.location.pathname,
    })
  })
}

async function showPatient(client) {
  connectButton.remove()
  status.textContent = '讀取中…'

  try {
    // client.patient.read() 讀的是 token 裡那個 patient context 指到的人，
    // 不必自己組網址，也不必自己帶 Authorization header。
    const patient = await client.patient.read()
    const summary = summarize(patient)

    details.replaceChildren(
      ...row('姓名', summary.name),
      ...row('性別', summary.gender),
      ...row('生日', summary.birthDate),
      ...row('病歷號', summary.id)
    )
    details.hidden = false

    status.textContent = summary.name
      ? `${summary.name} 的基本資料`
      : '這位病人沒有登記姓名'

    console.log('patient id：', client.patient.id)
    console.log('scope：', client.state.tokenResponse.scope)
  } catch (error) {
    status.textContent = '讀不到這位病人的資料'
    console.error(error)
  }
}

// 欄位是空的時候不要留一個空格子。
// 空格子看起來像畫面壞了，寫出來才知道是這筆資料本來就沒有。
//
// 值一律用 textContent 寫進去，不要組 HTML 字串。
// 姓名是伺服器給的資料，裡面若含有標籤會被瀏覽器當成 HTML 執行。
function row(label, value) {
  const dt = document.createElement('dt')
  dt.textContent = label

  const dd = document.createElement('dd')
  dd.textContent = value ?? '未提供'

  return [dt, dd]
}

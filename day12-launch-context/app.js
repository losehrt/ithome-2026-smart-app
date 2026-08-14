// 下面這串請換成自己的：到 SMART Health IT Launcher 選 Patient Standalone
// Launch，複製 Server's FHIR Base URL 欄位那一整串（含 /sim/ 的那個）。
// sim 後面的編碼每個人不一樣，抄這裡的值授權會失敗。
export const FHIR_BASE_URL =
  'https://launch.smarthealthit.org/v/r4/sim/WzMsIiIsIiIsIkFVVE8iLDAsMCwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0/fhir'

const SCOPE = 'launch/patient patient/Patient.r openid fhirUser'
const CLIENT_ID = 'my-smart-app'

const result = document.querySelector('#app')
const connectButton = document.querySelector('#connect')

FHIR.oauth2
  .ready()
  .then(showPatient)
  .catch(() => {
    // 還沒授權過，ready() 會 reject，這時候才顯示按鈕
    result.textContent = '準備好了，按按鈕開始授權'
    connectButton.disabled = false
    connectButton.addEventListener('click', () => {
      FHIR.oauth2.authorize({
        iss: FHIR_BASE_URL,
        clientId: CLIENT_ID,
        scope: SCOPE,
        redirectUri: window.location.pathname,
      })
    })
  })

async function showPatient(client) {
  connectButton.remove()

  console.log('patient id：', client.patient.id)
  console.log('encounter id：', client.encounter.id)
  console.log('fhirUser：', client.user.fhirUser)

  const patient = await client.patient.read()
  const name = patient.name?.[0]
  const display = name ? `${name.given?.join(' ')} ${name.family}` : '(這筆資料沒有姓名)'

  result.textContent = `${display}，生日 ${patient.birthDate}`
}

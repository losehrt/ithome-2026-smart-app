// 下面這串請換成自己的：到 SMART Health IT Launcher 選 Patient Standalone
// Launch，複製 Server's FHIR Base URL 欄位那一整串（含 /sim/ 的那個）。
// sim 後面的編碼每個人不一樣，抄這裡的值授權會失敗。
export const FHIR_BASE_URL =
  'https://launch.smarthealthit.org/v/r4/sim/WzMsIiIsIiIsIkFVVE8iLDAsMCwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0/fhir'

const CLIENT_ID = 'my-smart-app'
const SCOPE =
  'launch/patient patient/Patient.r openid fhirUser offline_access'

const result = document.querySelector('#app')
const connectButton = document.querySelector('#connect')
const refreshButton = document.querySelector('#refresh')

FHIR.oauth2
  .ready()
  .then(showEverything)
  .catch(() => {
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

async function showEverything(client) {
  connectButton.remove()

  const token = client.state.tokenResponse
  const idToken = client.getIdToken()

  console.log('patient id：', client.patient.id)
  console.log('encounter id：', client.encounter.id)
  console.log('fhirUser：', idToken?.fhirUser)
  console.log('aud 是不是我：', idToken?.aud === CLIENT_ID)
  console.log('scope：', token.scope)
  console.log('access token 尾八碼：', token.access_token.slice(-8))
  console.log('refresh token 尾八碼：', token.refresh_token?.slice(-8) ?? '(沒有)')

  const patient = await client.patient.read()
  const name = patient.name?.[0]
  const who = name ? `${name.given?.join(' ')} ${name.family}` : patient.id
  result.textContent = `${who}，生日 ${patient.birthDate}`

  if (!token.refresh_token) return

  refreshButton.disabled = false
  refreshButton.addEventListener('click', async () => {
    const before = client.state.tokenResponse.access_token
    const oldRefreshToken = client.state.tokenResponse.refresh_token
    await client.refresh()
    const after = client.state.tokenResponse.access_token
    console.log('access token 有換新嗎：', after !== before)

    const retry = await fetch(client.state.tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: oldRefreshToken,
        client_id: CLIENT_ID,
      }),
    })
    console.log('舊的那張再送一次：', retry.status)
  })
}

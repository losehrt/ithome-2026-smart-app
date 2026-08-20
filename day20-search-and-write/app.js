import { summarize } from './patient.js'
import { loadVitals, toChartData, renderChart } from './vitals.js'
import {
  loadConditions,
  loadMedications,
  conditionsTable,
  medicationsTable,
} from './clinical.js'
import { selfMeasuredBloodPressure, createRaw } from './write.js'
import { describeFailure, describeClientError } from './errors.js'
import { fetchAllPagesByHand } from './search.js'

// 換成自己的：到 SMART Health IT Launcher 選 Patient Standalone
// Launch，複製 Server's FHIR Base URL 欄位那一整串（含 /sim/ 的那個）。
export const FHIR_BASE_URL =
  'https://launch.smarthealthit.org/v/r4/sim/WzMsIiIsIiIsIkFVVE8iLDAsMCwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0/fhir'

const CLIENT_ID = 'my-smart-app'
const SCOPE =
  'launch/patient patient/*.crs openid fhirUser offline_access'

const status = document.querySelector('#status')
const connectButton = document.querySelector('#connect')
const details = document.querySelector('#patient')
const vitalsCanvas = document.querySelector('#vitals')
const conditionsBox = document.querySelector('#conditions')
const medicationsBox = document.querySelector('#medications')
const systolicInput = document.querySelector('#systolic')
const diastolicInput = document.querySelector('#diastolic')
const saveButton = document.querySelector('#save-bp')
const writeResult = document.querySelector('#write-result')
const errorResult = document.querySelector('#error-result')

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

    // 三塊資料互不相干，一起發出去
    await Promise.all([
      showVitals(client),
      showConditions(client),
      showMedications(client),
    ])
  } catch (error) {
    status.textContent = '讀不到這位病人的資料'
    console.error(error)
  }

  saveButton.disabled = false
  saveButton.addEventListener('click', () => saveBloodPressure(client))

  for (const button of document.querySelectorAll('[data-case]')) {
    button.addEventListener('click', () => tryFailure(client, button.dataset.case))
  }

  document
    .querySelector('#run-paging')
    .addEventListener('click', () => runPaging(client))
}

async function runPaging(client) {
  const { pages, resources } = await fetchAllPagesByHand(
    client,
    `Observation?patient=${client.patient.id}&_count=10`
  )
  console.log('第一頁的 relations：', pages[0].relations)
  console.log('第一頁的 next：', pages[0].next)
  console.log(`跟了 ${pages.length} 頁，拿到 ${resources.length} 筆，total 是 ${pages[0].total}`)
}

const FAILURE_CASES = {
  notfound: (base) => [`${base}/Observation/no-such-observation-xyz`, {}],
  badparam: (base) => [`${base}/Observation?totally-not-a-param=1`, {}],
  badtoken: (base, patientId) => [
    `${base}/Patient/${patientId}`,
    { headers: { Authorization: 'Bearer not-a-real-token' } },
  ],
  mismatch: (base) => [
    `${base}/Observation`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/fhir+json' },
      body: JSON.stringify({ resourceType: 'Patient' }),
    },
  ],
}

// 斷網、DNS 解不出來、CORS 預檢被擋，這三種是 fetch 自己 reject。
// 沒有這個 catch，它們會變成一個沒人接的 Promise rejection。
async function tryFailure(client, name) {
  try {
    const [url, init] = FAILURE_CASES[name](client.state.serverUrl, client.patient.id)
    report(name, await describeFailure(await fetch(url, init)))
  } catch (error) {
    report(name, describeClientError(error))
  }
}

function report(name, failure) {
  console.log(`[${name}]`, failure.status, failure.retriable ? '可重試' : '不重試')
  console.log('  給使用者：', failure.userMessage)
  console.log('  給開發者：', failure.developerMessage)

  errorResult.className = 'mt-2 text-sm text-rose-700'
  errorResult.textContent = `HTTP ${failure.status}：${failure.userMessage}`
}

async function saveBloodPressure(client) {
  saveButton.disabled = true
  const resource = selfMeasuredBloodPressure(
    client.patient.id,
    Number(systolicInput.value),
    Number(diastolicInput.value),
    new Date().toISOString()
  )

  const outcome = await createRaw(client, resource)
  console.log('HTTP', outcome.status)
  console.log('Location：', outcome.location)
  console.log('ETag：', outcome.etag)
  console.log('讀得到的 header：', outcome.exposedHeaders)
  console.log('新資源 id：', outcome.body.id)

  writeResult.textContent = outcome.ok
    ? `存好了，id 是 ${outcome.body.id}。重整頁面就會出現在上面的趨勢圖`
    : `存不進去，HTTP ${outcome.status}`
  saveButton.disabled = false
}

async function showConditions(client) {
  const rows = await loadConditions(client)
  conditionsBox.className = ''
  conditionsBox.innerHTML = conditionsTable(rows)
  console.log('病況：', rows.length, '筆')
}

async function showMedications(client) {
  const rows = await loadMedications(client)
  medicationsBox.className = ''
  medicationsBox.innerHTML = medicationsTable(rows)
  console.log('用藥：', rows.length, '筆')
}

async function showVitals(client) {
  const data = toChartData(await loadVitals(client))
  renderChart(vitalsCanvas, data)

  const counted = data.datasets.map(
    (one) => one.data.filter((value) => value !== null).length
  )
  console.log('趨勢圖：', data.labels.length, '個日期，各線', counted)
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

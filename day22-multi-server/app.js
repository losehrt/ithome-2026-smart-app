import { SERVERS, getConfiguration, forgetDiscovery } from './servers.js'
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

const SERVER_KEY = 'smart-app.server'

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
// 畫面會叫一個已經授權完的人再去挑一次醫院。
FHIR.oauth2.ready().then(showPatient, offerConnect)

// 綁定只做一次，授權前後共用同一組按鈕。
for (const button of connectButton.querySelectorAll('[data-server]')) {
  button.addEventListener('click', () => authorize(button.dataset.server))
}
document.querySelector('#forget').addEventListener('click', () => {
  forgetDiscovery()
  status.textContent = 'discovery 快取已清掉，下次連線會重抓'
})

function offerConnect() {
  status.textContent = '還沒授權，挑一家醫院開始'

  for (const button of connectButton.querySelectorAll('[data-server]')) {
    button.hidden = false
    button.textContent = `連線到 ${SERVERS[button.dataset.server].label}`
  }
  connectButton.hidden = false
}

// 授權完之後三顆都留著。目前這家換成「重新連」，那不是多餘的按鈕：
// 要驗證 discovery 有沒有命中快取，就是在已連 A 的狀態下再連一次 A。
// 清快取那顆跟授權狀態無關，一直留著，day22 要按它才示範得出快取行為。
function showSwitchControls(currentKey) {
  for (const button of connectButton.querySelectorAll('[data-server]')) {
    const key = button.dataset.server
    const label = SERVERS[key].label
    button.hidden = false
    button.textContent = key === currentKey ? `重新連 ${label}` : `換到 ${label}`
  }
  connectButton.hidden = false
}

async function authorize(key) {
  const server = SERVERS[key]
  // 記住這次選了哪一家，導回來之後才知道要顯示哪一家的名字
  sessionStorage.setItem(SERVER_KEY, key)

  // 先過我們這一層快取。命中的話這一層不發請求，
  // 但下一行的 fhirclient 仍會自行抓一次 discovery。
  await getConfiguration(server)

  FHIR.oauth2.authorize({
    iss: server.fhirBaseUrl,
    clientId: server.clientId,
    scope: server.scope,
    redirectUri: window.location.pathname,
  })
}

async function showPatient(client) {
  showSwitchControls(sessionStorage.getItem(SERVER_KEY) ?? 'a')
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

    const server = SERVERS[sessionStorage.getItem(SERVER_KEY) ?? 'a']
    status.textContent = summary.name
      ? `${server.label}：${summary.name} 的基本資料`
      : `${server.label}：這位病人沒有登記姓名`

    console.log('伺服器：', server.label, server.clientId)
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

// 成功跟失敗要看得出差別。都印成同一種灰色的話，
// 存不進去跟存好了在畫面上長得一模一樣，得瞇著眼睛讀字才知道。
function showWriteResult(message, ok) {
  const tone =
    ok === null ? 'text-slate-600' : ok ? 'text-emerald-700' : 'text-rose-700'

  writeResult.className = `mt-2 text-sm ${tone}`
  writeResult.textContent = message
}

// FHIR 把錯誤的細節放在 OperationOutcome 裡，不是放在狀態碼上。
// 只印 HTTP 422 的話，沒有人知道是哪個欄位不合格。
function issueText(body) {
  const issue = body?.issue?.[0]
  return issue?.diagnostics ?? issue?.details?.text ?? '伺服器沒有說原因'
}

async function saveBloodPressure(client) {
  // Number('') 是 0，而 Number.isFinite(0) 是 true。
  // 照原本那樣送，欄位留空就會在病歷上留下一筆 0 mm[Hg] 的血壓。
  const systolic = Number.parseFloat(systolicInput.value)
  const diastolic = Number.parseFloat(diastolicInput.value)

  if (!Number.isFinite(systolic) && !Number.isFinite(diastolic)) {
    showWriteResult('先填收縮壓或舒張壓，至少要有一個值', false)
    return
  }

  saveButton.disabled = true
  showWriteResult('存回伺服器中…', null)

  try {
    const resource = selfMeasuredBloodPressure(
      client.patient.id,
      systolic,
      diastolic,
      new Date().toISOString()
    )

    const outcome = await createRaw(client, resource)
    console.log('HTTP', outcome.status)
    console.log('Location：', outcome.location)
    console.log('ETag：', outcome.etag)
    console.log('讀得到的 header：', outcome.exposedHeaders)

    if (!outcome.ok) {
      console.error('寫入失敗：', outcome.body)
      showWriteResult(
        `存不進去，HTTP ${outcome.status}：${issueText(outcome.body)}`,
        false
      )
      return
    }

    console.log('新資源 id：', outcome.body?.id)
    showWriteResult(`存好了，id 是 ${outcome.body?.id}，正在更新趨勢圖…`, true)

    // 重新查一次，不是把剛剛填的值直接畫上去。
    // 畫上去只證明表單收到了值，查得回來才證明伺服器真的收下了。
    await showVitals(client)
    showWriteResult(
      `存好了，id 是 ${outcome.body?.id}，趨勢圖最右邊那個點就是這一筆`,
      true
    )
  } catch (error) {
    // 斷網、DNS 解不出來、CORS 預檢被擋，這幾種是 fetch 自己 reject。
    // 沒有這個 catch 的話畫面就停在原地，什麼都不會說，
    // 按鈕也永遠鎖著，看起來像整個 app 當掉了。
    console.error(error)
    showWriteResult(`送不出去：${error.message}`, false)
  } finally {
    // 放 finally。上面任何一條路走掉都要把按鈕解開，
    // 不然使用者只能重整頁面才能再按一次。
    saveButton.disabled = false
  }
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

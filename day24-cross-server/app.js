import { SERVERS, getConfiguration, forgetDiscovery } from './servers.js'
import {
  loadObservations,
  tag,
  mergeByTime,
  countAlternations,
} from './merge.js'

// 兩家要合併，就得同時握有兩把有效的 token。
// fhirclient 一次只認一組 session，所以授權完成後要自己把 client.state 收起來。
//
// 收在 sessionStorage 不是 localStorage：關掉分頁就沒了，跟 fhirclient 自己的
// 預設一致，也不會教人把 token 長期留在瀏覽器裡。
const STATE_PREFIX = 'smart-app.state.'
const PENDING_KEY = 'smart-app.pending'

const status = document.querySelector('#status')
const connect = document.querySelector('#connect')
const summary = document.querySelector('#summary')
const timeline = document.querySelector('#timeline')
const mergeButton = document.querySelector('#merge')

function saveState(key, state) {
  sessionStorage.setItem(STATE_PREFIX + key, JSON.stringify(state))
}

function loadState(key) {
  const raw = sessionStorage.getItem(STATE_PREFIX + key)
  return raw ? JSON.parse(raw) : null
}

function authorizedKeys() {
  return Object.keys(SERVERS).filter((key) => loadState(key))
}

function refresh() {
  const done = authorizedKeys()
  status.textContent = done.length
    ? `已授權：${done.map((key) => SERVERS[key].label).join('、')}`
    : '還沒授權任何一家，兩家都授權完才合併得起來'
  connect.hidden = false
  mergeButton.disabled = done.length < 2
}

// 導回來的時候，ready() 會 resolve。授權前記在 pending 的代號告訴我們這是哪一家。
FHIR.oauth2
  .ready()
  .then((client) => {
    const key = sessionStorage.getItem(PENDING_KEY)
    sessionStorage.removeItem(PENDING_KEY)
    if (key) saveState(key, client.state)
    refresh()
  })
  .catch(() => {
    // 還沒授權過，或這一次不是從授權導回來的。兩種都是正常狀態。
    refresh()
  })

for (const button of connect.querySelectorAll('[data-server]')) {
  button.addEventListener('click', async () => {
    const key = button.dataset.server
    const server = SERVERS[key]

    sessionStorage.setItem(PENDING_KEY, key)
    await getConfiguration(server)

    FHIR.oauth2.authorize({
      iss: server.fhirBaseUrl,
      clientId: server.clientId,
      scope: server.scope,
      redirectUri: window.location.pathname,
    })
  })
}

document.querySelector('#reset').addEventListener('click', () => {
  sessionStorage.clear()
  forgetDiscovery()
  location.reload()
})

mergeButton.addEventListener('click', async () => {
  const keys = authorizedKeys()
  if (keys.length < 2) return

  summary.textContent = '讀取中…'
  timeline.replaceChildren()

  const perServer = []
  const tagged = []

  for (const key of keys) {
    const server = SERVERS[key]
    const client = FHIR.client(loadState(key))

    const patient = await client.patient.read()
    const resources = await loadObservations(client)
    const dates = resources
      .map((one) => one.effectiveDateTime)
      .filter(Boolean)
      .sort()

    perServer.push({
      label: server.label,
      name: nameOf(patient),
      count: resources.length,
      from: localDay(dates[0]),
      to: localDay(dates[dates.length - 1]),
    })
    tagged.push(tag(resources, server, key))
  }

  const { rows, datedCount, undatedCount } = mergeByTime(...tagged)

  renderSummary(perServer, rows, datedCount, undatedCount)
  renderTimeline(rows)
})

// 顯示日期不要切字串。伺服器存的是 UTC，直接取前十個字，
// 台灣 00:00 到 07:59 的紀錄會顯示成前一天。轉成 Date 再取本地欄位才對。
function localDay(iso) {
  const parsed = new Date(iso ?? '')
  if (Number.isNaN(parsed.getTime())) return ''

  const pad = (value) => String(value).padStart(2, '0')
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`
}

// 伺服器回來的字串一律經過 textContent。病人姓名與 Observation 的顯示名稱
// 都是對方給的資料，拼進 innerHTML 會被瀏覽器當標記解析。
// 表頭那種自己寫死的字串才可以直接給 innerHTML。
function appendRow(tbody, cells) {
  const tr = document.createElement('tr')
  tr.className = 'border-t border-slate-100'

  for (const [text, className] of cells) {
    const td = document.createElement('td')
    td.className = className
    td.textContent = text ?? ''
    tr.append(td)
  }

  tbody.append(tr)
}

function nameOf(patient) {
  const name = patient.name?.[0]
  if (!name) return '（無姓名）'
  return [name.given?.join(' '), name.family].filter(Boolean).join(' ')
}

function renderSummary(perServer, rows, datedCount, undatedCount) {
  const switches = countAlternations(rows)
  const total = perServer.reduce((sum, one) => sum + one.count, 0)

  const table = document.createElement('table')
  table.className = 'w-full text-sm'
  table.innerHTML =
    '<thead><tr class="text-left text-slate-500">' +
    '<th class="p-1">來源</th><th class="p-1">病人</th>' +
    '<th class="p-1">筆數</th><th class="p-1">最早</th><th class="p-1">最晚</th>' +
    '</tr></thead><tbody></tbody>'

  const tbody = table.querySelector('tbody')
  for (const one of perServer) {
    appendRow(tbody, [
      [one.label, 'p-1'],
      [one.name, 'p-1'],
      [one.count, 'p-1'],
      [one.from, 'p-1'],
      [one.to, 'p-1'],
    ])
  }

  // 這一段的值全是程式自己算出來的數字，沒有伺服器字串。
  const counts = document.createElement('p')
  counts.className = 'mt-3'
  counts.innerHTML =
    `合併後 <strong>${rows.length}</strong> 筆` +
    `（各家相加 ${total}，有時間 ${datedCount}，無時間 ${undatedCount}）。` +
    `來源在時間軸上換手 <strong>${switches}</strong> 次。`

  summary.replaceChildren(table, counts)

  if (switches <= 1) {
    const warning = document.createElement('p')
    warning.className = 'text-amber-700'
    warning.textContent =
      '換手一次以下代表兩家的時間範圍幾乎沒重疊，這種資料看不出合併排序的效果。'
    summary.append(warning)
  }
}

// 每一列都帶來源。把來源那一欄遮起來再看一次，就知道它為什麼不是裝飾。
function renderTimeline(rows) {
  const table = document.createElement('table')
  table.className = 'w-full bg-white text-sm shadow-sm'
  table.innerHTML =
    '<thead><tr class="text-left">' +
    '<th class="p-2">時間</th><th class="p-2">來源</th>' +
    '<th class="p-2">項目</th><th class="p-2">值</th>' +
    '</tr></thead><tbody></tbody>'

  const tbody = table.querySelector('tbody')
  for (const row of rows) {
    appendRow(tbody, [
      [localDay(row.when), 'p-2 whitespace-nowrap'],
      [row.label, 'p-2 whitespace-nowrap'],
      [row.text, 'p-2'],
      [row.value, 'p-2 whitespace-nowrap'],
    ])
  }

  timeline.replaceChildren(table)
}

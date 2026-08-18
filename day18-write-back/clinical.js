// 病況與用藥。這兩種資料是文字不是數字，
// 而 FHIR 放文字的地方有三層，三層都可能是空的。

// CodeableConcept 的取值優先序：
// 1. text，來源系統原本就寫給人看的那一句
// 2. coding[].display，代碼系統給的標準名稱
// 3. code 本身，前兩層都沒有時只剩它
export function displayOf(concept, fallback = '（未提供名稱）') {
  if (!concept) return fallback
  if (concept.text) return concept.text
  const coding = concept.coding?.[0]
  return coding?.display ?? coding?.code ?? fallback
}

// clinicalStatus 這種欄位的 coding 常常只有 system 與 code，
// 沒有 display 也沒有 text。要的是機器判讀用的 code，不是給人看的字。
export function codeOf(concept) {
  return concept?.coding?.[0]?.code ?? 'unknown'
}

const CONDITION_STATUS = {
  active: '仍在追蹤',
  recurrence: '復發',
  relapse: '復發',
  inactive: '未在追蹤',
  remission: '緩解',
  resolved: '已解決',
  unknown: '狀態不明',
}

const MEDICATION_STATUS = {
  active: '使用中',
  'on-hold': '暫停',
  cancelled: '已取消',
  completed: '已完成',
  stopped: '已停用',
  draft: '草稿',
  unknown: '狀態不明',
}

export async function loadConditions(client) {
  const list = await client.request(
    `Condition?patient=${client.patient.id}&_count=100`,
    { pageLimit: 0, flat: true }
  )
  return list
    .map((one) => ({
      name: displayOf(one.code),
      status: codeOf(one.clinicalStatus),
      onset: one.onsetDateTime?.slice(0, 10) ?? '',
    }))
    .sort((a, b) => b.onset.localeCompare(a.onset))
}

export async function loadMedications(client) {
  const list = await client.request(
    `MedicationRequest?patient=${client.patient.id}&_count=100`,
    { pageLimit: 0, flat: true }
  )
  return list
    .map((one) => ({
      // 藥名有兩種寫法：內嵌的 medicationCodeableConcept，
      // 或指向另一個 Medication 資源的 medicationReference。
      name: one.medicationCodeableConcept
        ? displayOf(one.medicationCodeableConcept)
        : `（需另外讀取 ${one.medicationReference?.reference}）`,
      status: one.status ?? 'unknown',
      authoredOn: one.authoredOn?.slice(0, 10) ?? '',
      dosage: dosageText(one.dosageInstruction?.[0]),
    }))
    .sort((a, b) => b.authoredOn.localeCompare(a.authoredOn))
}

// dosageInstruction 的 text 是給人看的整句用法，真實 EHR 多半會給。
// 這台 sandbox 只給 asNeededBoolean，連 text 都沒有。
function dosageText(dosage) {
  if (!dosage) return ''
  if (dosage.text) return dosage.text
  return dosage.asNeededBoolean ? '需要時服用' : ''
}

const TABLE = 'w-full text-sm border-collapse'
const TH = 'px-3 py-2 text-left font-medium text-slate-600 border-b border-slate-300'
const TD = 'px-3 py-2 border-b border-slate-200'

function table(headers, rows) {
  const head = headers.map((one) => `<th class="${TH}">${one}</th>`).join('')
  const body = rows
    .map((cells) => `<tr>${cells.map((one) => `<td class="${TD}">${one}</td>`).join('')}</tr>`)
    .join('')
  return `<table class="${TABLE}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

// 狀態用顏色區分，但顏色不是唯一的線索，文字照樣寫出來。
// 只靠顏色的話，色覺不同的人讀不到這個資訊。
function statusBadge(label, active) {
  const tone = active
    ? 'bg-emerald-100 text-emerald-800'
    : 'bg-slate-100 text-slate-600'
  return `<span class="inline-block rounded px-2 py-0.5 text-xs ${tone}">${label}</span>`
}

export function conditionsTable(rows) {
  if (!rows.length) return '<p class="text-slate-500">這位病人沒有病況記錄。</p>'
  return table(
    ['病況', '狀態', '起始'],
    rows.map((one) => [
      one.name,
      statusBadge(CONDITION_STATUS[one.status] ?? one.status, one.status === 'active'),
      one.onset,
    ])
  )
}

export function medicationsTable(rows) {
  if (!rows.length) return '<p class="text-slate-500">這位病人沒有用藥記錄。</p>'
  return table(
    ['藥品', '狀態', '用法', '開立日'],
    rows.map((one) => [
      one.name,
      statusBadge(MEDICATION_STATUS[one.status] ?? one.status, one.status === 'active'),
      one.dosage,
      one.authoredOn,
    ])
  )
}

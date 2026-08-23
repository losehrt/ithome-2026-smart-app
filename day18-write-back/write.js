// 從唯讀跨到可寫。
// 示範資源是病人自己在家量的血壓，不是診間量的，
// 所以 performer 指向病人本人。

import { BLOOD_PRESSURE } from './vitals.js'

function pressureComponent(code, display, value) {
  return {
    code: { coding: [{ system: 'http://loinc.org', code, display }] },
    valueQuantity: {
      value,
      unit: 'mm[Hg]',
      system: 'http://unitsofmeasure.org',
      code: 'mm[Hg]',
    },
  }
}

export function selfMeasuredBloodPressure(patientId, systolic, diastolic, when) {
  const component = []

  // 只量到收縮壓也送得出去。缺的那一段就是缺，不要塞 0 進去。
  if (Number.isFinite(systolic)) {
    component.push(pressureComponent('8480-6', 'Systolic Blood Pressure', systolic))
  }
  if (Number.isFinite(diastolic)) {
    component.push(pressureComponent('8462-4', 'Diastolic Blood Pressure', diastolic))
  }

  return {
    resourceType: 'Observation',
    status: 'final',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'vital-signs',
            display: 'vital-signs',
          },
        ],
      },
    ],
    code: {
      coding: [
        { system: 'http://loinc.org', code: BLOOD_PRESSURE, display: 'Blood Pressure' },
      ],
      text: 'Blood Pressure',
    },
    subject: { reference: `Patient/${patientId}` },
    // 這一筆是病人自己量的。寫下來以後才分得出跟診間量的差別。
    performer: [{ reference: `Patient/${patientId}` }],
    effectiveDateTime: when,
    issued: when,
    component,
  }
}

// 協定層版本，用來看清楚 POST 回了什麼。
// 201、Location、ETag 這三樣 client.create() 都會替你吃掉。
export async function createRaw(client, resource) {
  const response = await fetch(`${client.state.serverUrl}/Observation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/fhir+json',
      Authorization: `Bearer ${client.state.tokenResponse.access_token}`,
    },
    body: JSON.stringify(resource),
  })

  return {
    ok: response.ok,
    status: response.status,
    // 這兩個在瀏覽器裡讀回來是空的。CORS 沒放行，看得到的只有
    // content-length 與 content-type。留在這裡是為了讓你自己跑一次看見。
    location: response.headers.get('location'),
    etag: response.headers.get('etag'),
    exposedHeaders: [...response.headers.keys()],
    body: await readBody(response),
  }
}

// 失敗的回應不一定是 JSON。401 常常回一整頁 HTML，204 根本沒有 body。
// 直接 .json() 的話會丟出一個解析錯誤，把原本那個看得懂的狀態碼蓋掉，
// 畫面上就只剩「Unexpected token < in JSON」這種跟病人無關的訊息。
async function readBody(response) {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    // 包成 OperationOutcome 的形狀，讓上層用同一條路徑取錯誤訊息。
    return {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', diagnostics: text.slice(0, 200) }],
    }
  }
}

// 平常就用這個。
export async function create(client, resource) {
  return client.create(resource)
}

export async function update(client, resource) {
  return client.update(resource)
}

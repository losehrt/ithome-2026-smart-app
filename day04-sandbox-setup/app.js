// 連線設定集中在一處，換 sandbox 只改這裡
export const FHIR_BASE_URL = 'https://r4.smarthealthit.org'

const result = document.querySelector('#app')

const client = FHIR.client({ serverUrl: FHIR_BASE_URL })

client
  .request('Patient?_count=1')
  .then((bundle) => {
    const patient = bundle.entry?.[0]?.resource
    result.textContent = patient
      ? `連線成功：Patient/${patient.id}`
      : '連線成功，但沒有找到 Patient 資料'
  })
  .catch((error) => {
    result.textContent = `連線失敗：${error.message}`
  })

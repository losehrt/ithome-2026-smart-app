// Observation 的值可能長在兩個地方。
// 血壓是一筆資源帶兩個 component，體重是資源層直接一個 valueQuantity。
// 同樣是 Observation，取值的路徑不一樣。

export const BLOOD_PRESSURE = '55284-4'
export const BODY_WEIGHT = '29463-7'
const SYSTOLIC = '8480-6'
const DIASTOLIC = '8462-4'

// status 在 FHIR 裡是 modifier element，它會改變整筆資料該怎麼被理解。
// entered-in-error 的意思是「這筆被標記為誤登」，畫上趨勢圖是臨床安全問題。
// 這裡列出可以拿來畫的三個狀態，其餘一律不畫。
const USABLE_STATUS = new Set(['final', 'amended', 'corrected'])

function usable(observation) {
  return USABLE_STATUS.has(observation.status)
}

// component 陣列的順序不保證。這台 sandbox 就是舒張壓排在收縮壓前面。
// 認代碼，不要認索引。
function componentValue(observation, loincCode) {
  const hit = observation.component?.find((one) =>
    one.code?.coding?.some((coding) => coding.code === loincCode)
  )
  return hit?.valueQuantity?.value ?? null
}

function day(observation) {
  return observation.effectiveDateTime?.slice(0, 10) ?? ''
}

// Synthea 產的值帶十幾位小數，129.75969944651848 這種數字
// 不管是畫上圖還是印在畫面上都不像話。
function round(value) {
  return value == null ? null : Math.round(value)
}

export async function loadVitals(client) {
  const query = (code) =>
    client.request(
      `Observation?patient=${client.patient.id}&code=${code}&_sort=date&_count=100`,
      { pageLimit: 0, flat: true }
    )

  // 兩個查詢沒有先後關係，一起發出去
  const [bloodPressure, weight] = await Promise.all([
    query(BLOOD_PRESSURE),
    query(BODY_WEIGHT),
  ])

  // 狀態不能用的在這裡就篩掉，後面組圖表資料那段不必再管一次
  return {
    bloodPressure: bloodPressure.filter(usable),
    weight: weight.filter(usable),
  }
}

export function toChartData({ bloodPressure, weight }) {
  // x 軸用日期字串當分類，不是等距的時間軸。
  // 這批資料一年一筆，間隔本來就不平均。
  const labels = [...new Set([...bloodPressure, ...weight].map(day))]
    .filter(Boolean)
    .sort()

  const pick = (list, getValue) =>
    labels.map((label) => {
      const hit = list.find((one) => day(one) === label)
      return hit ? round(getValue(hit)) : null
    })

  return {
    labels,
    datasets: [
      {
        label: '收縮壓 (mm[Hg])',
        data: pick(bloodPressure, (one) => componentValue(one, SYSTOLIC)),
        yAxisID: 'pressure',
        borderColor: '#a8483e',
        spanGaps: true,
      },
      {
        label: '舒張壓 (mm[Hg])',
        data: pick(bloodPressure, (one) => componentValue(one, DIASTOLIC)),
        yAxisID: 'pressure',
        borderColor: '#d98b7f',
        spanGaps: true,
      },
      {
        label: '體重 (kg)',
        data: pick(weight, (one) => one.valueQuantity?.value ?? null),
        yAxisID: 'weight',
        borderColor: '#2f4858',
        spanGaps: true,
      },
    ],
  }
}

let chart = null

export function renderChart(canvas, data) {
  chart?.destroy()
  chart = new Chart(canvas, {
    type: 'line',
    data,
    options: {
      responsive: true,
      // 兩條線單位不同，一個 mm[Hg] 一個 kg。
      // 共用一個 y 軸的話，體重那條會被壓成一條貼著底的直線。
      scales: {
        pressure: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'mm[Hg]' },
        },
        weight: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'kg' },
        },
      },
    },
  })
  return chart
}

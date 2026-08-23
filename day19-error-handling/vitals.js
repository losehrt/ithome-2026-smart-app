// Observation 的值可能長在兩個地方。
// 血壓是一筆資源帶兩個 component，體重是資源層直接一個 valueQuantity。
// 同樣是 Observation，取值的路徑不一樣。

export const BLOOD_PRESSURE = '55284-4'
export const BODY_WEIGHT = '29463-7'
const SYSTOLIC = '8480-6'
const DIASTOLIC = '8462-4'

// component 陣列的順序不保證。這台 sandbox 就是舒張壓排在收縮壓前面。
// 認代碼，不要認索引。
function componentValue(observation, loincCode) {
  const hit = observation.component?.find((one) =>
    one.code?.coding?.some((coding) => coding.code === loincCode)
  )
  return hit?.valueQuantity?.value ?? null
}

// 自己在家量血壓，一天量好幾次是常態，所以時間點切到分鐘，不是切到天。
// 切到天的話，當天第一筆之後量的全部會被蓋掉，存進去了也看不見。
//
// 還有一件事：effectiveDateTime 存的是 UTC。台灣早上八點量的那筆
// 在 UTC 是前一天午夜，照著前十個字切會標到錯的日子上去。
// 轉成 Date 再取本地欄位，畫出來的日子才跟量的人記得的那天對得起來。
function stamp(observation) {
  const at = new Date(observation.effectiveDateTime ?? '')
  if (Number.isNaN(at.getTime())) return ''

  const pad = (value) => String(value).padStart(2, '0')
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    ` ${pad(at.getHours())}:${pad(at.getMinutes())}`
  )
}

// Synthea 產的值帶十幾位小數，129.75969944651848 這種數字
// 不管是畫上圖還是印在畫面上都不像話。
function round(value) {
  return value == null ? null : Math.round(value)
}

export async function loadVitals(client) {
  const query = (code) =>
    client.request(
      {
        url: `Observation?patient=${client.patient.id}&code=${code}&_sort=date&_count=100`,
        // 這台伺服器的搜尋回應沒有 Cache-Control，也沒有 ETag 或 Last-Modified。
        // 少了這些，瀏覽器不會去問「有沒有變」，而是自己決定這份答案還新鮮，
        // 直接把上一次的結果拿出來用。存完血壓立刻重查，查到的會是存之前那份，
        // 圖上少一個點，看起來就像根本沒寫進去。
        //
        // 第一個參數改成物件才放得下 fetch 的選項，fhirOptions 仍走第二個。
        cache: 'no-store',
      },
      { pageLimit: 0, flat: true }
    )

  // 兩個查詢沒有先後關係，一起發出去
  const [bloodPressure, weight] = await Promise.all([
    query(BLOOD_PRESSURE),
    query(BODY_WEIGHT),
  ])
  return { bloodPressure, weight }
}

export function toChartData({ bloodPressure, weight }) {
  // x 軸用時間字串當分類，不是等距的時間軸。
  // 這批資料一年一筆，間隔本來就不平均。
  // 格式固定寬度，所以字串排序出來就是時間順序。
  const labels = [...new Set([...bloodPressure, ...weight].map(stamp))]
    .filter(Boolean)
    .sort()

  // 先建索引再照 labels 取值。原本用 find 逐筆掃，
  // 同一個時間點上永遠只拿得到最先掃到的那一筆，後面的就不見了。
  const pick = (list, getValue) => {
    const byStamp = new Map()
    for (const one of list) {
      const key = stamp(one)
      if (key) byStamp.set(key, round(getValue(one)))
    }
    return labels.map((label) => byStamp.get(label) ?? null)
  }

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
        // label 現在帶到分鐘，字比原本長。
        // 全部攤開會擠成一團，讓 Chart.js 自己決定跳過哪幾格。
        x: {
          ticks: { autoSkip: true, maxRotation: 45, minRotation: 45 },
        },
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

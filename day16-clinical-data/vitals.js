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

// 血壓差個五到十就有臨床意義，靠眼睛在格線之間抓抓不準。
// Chart.js 沒有內建的資料標籤，官方的解法是再裝一個外掛，
// 但那表示 vendor 底下要多一個檔案，讀者跑這個資料夾就多一樣要準備的東西。
// 自己在 afterDatasetsDraw 這個掛點上畫，成本只有下面這二十行。
//
// 標籤往哪邊放是照 dataset 的順序決定的：收縮壓那條在上、舒張壓那條在下。
// 兩條共用同一個 y 軸又貼得近，同一個時間點上不錯開的話會疊在一起。
const OFFSET_BY_DATASET = { 0: -8, 1: 14 }

const pointValueLabels = {
  id: 'pointValueLabels',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart

    ctx.save()
    // 比 x 軸刻度小一級。標籤是拿來核對數字的，不該變成圖上最搶眼的東西。
    ctx.font = '10px system-ui, sans-serif'
    ctx.textAlign = 'center'

    // 標籤畫在線的上面，但線比字粗。數字的筆畫壓在深色線上會糊成一團，
    // 127 的那個 1 疊在體重線上就讀成 27。先描一圈白邊再填色，
    // 字就從背後的線浮出來，不必去管標籤落在哪條線上。
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.lineJoin = 'round'

    for (const [index, offset] of Object.entries(OFFSET_BY_DATASET)) {
      const meta = chart.getDatasetMeta(Number(index))
      // 圖例點掉某條線的時候 meta.hidden 會是 true，這時候不要畫它的標籤
      if (!meta || meta.hidden) continue

      // 標籤顏色跟著線走，讀者才不必靠上下位置去猜這個數字是哪一條的
      ctx.fillStyle = chart.data.datasets[Number(index)].borderColor
      ctx.textBaseline = offset < 0 ? 'bottom' : 'top'

      meta.data.forEach((point, i) => {
        const value = chart.data.datasets[Number(index)].data[i]
        // 沒有值的點不要畫。少了這一行，缺的那幾格會印出 null
        if (value == null) return

        // 頭尾兩個點就坐在繪圖區邊界上，置中畫的話有一半會被裁掉，
        // 三位數的血壓被切成兩位數還是看得懂的數字，這種錯讀不出來。
        // 把標籤往內夾，寧可跟它的點差幾個像素。
        //
        // 多留兩個像素。measureText 量到的寬度跟實際畫出來的會差一點，
        // 剛好卡在邊界上的那個標籤還是會被削掉一條邊。
        const half = ctx.measureText(value).width / 2 + 2
        const x = Math.min(
          Math.max(point.x, chartArea.left + half),
          chartArea.right - half
        )
        ctx.strokeText(value, x, point.y + offset)
        ctx.fillText(value, x, point.y + offset)
      })
    }

    ctx.restore()
  },
}

export function renderChart(canvas, data) {
  chart?.destroy()
  chart = new Chart(canvas, {
    type: 'line',
    data,
    plugins: [pointValueLabels],
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

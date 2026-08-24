// day24：跨伺服器合併與來源標註。
//
// 合併的單位是「一筆觀測」，不是「一台伺服器的回應」。
// 每一筆在離開它的來源之前就要先貼上來源標籤，之後才排得動、也追得回去。

// 讀一家醫院的 Observation。
//
// 查詢一定要自己帶 patient。token 裡有 patient context 不代表查詢會自動限定
// 範圍，少帶這個參數就是在翻整台伺服器的資料。
// pageLimit: 0 是跟到最後一頁，flat: true 是把 entry 攤平成資源陣列，
// 兩個都是 day20 教過的。
export async function loadObservations(client) {
  return client.request(
    `Observation?patient=${client.patient.id}&_count=100`,
    { pageLimit: 0, flat: true }
  )
}

// 貼來源標籤。label 給人看，key 給程式分組。
// 這一步必須在合併之前做，合併之後就分不出來了。
export function tag(resources, server, key) {
  return resources.map((resource) => ({
    key,
    label: server.label,
    when: resource.effectiveDateTime ?? resource.effectivePeriod?.start ?? null,
    text: displayOf(resource),
    value: valueOf(resource),
  }))
}

function displayOf(resource) {
  return (
    resource.code?.text ?? resource.code?.coding?.[0]?.display ?? '（無名稱）'
  )
}

function valueOf(resource) {
  const quantity = resource.valueQuantity
  if (quantity) {
    return `${round(quantity.value)} ${quantity.unit ?? ''}`.trim()
  }
  // 血壓這類把值放在 component 裡，這裡只取第一個當摘要。
  const first = resource.component?.[0]?.valueQuantity
  if (first) {
    return `${round(first.value)} ${first.unit ?? ''}`.trim()
  }
  return resource.valueString ?? resource.valueCodeableConcept?.text ?? ''
}

function round(value) {
  return value == null ? null : Math.round(value * 10) / 10
}

// 合併後排序。沒有時間的排最後，不要讓它們污染時間軸的頭。
//
// 時間完全相同的兩筆用來源代號當次要排序鍵，這樣每次跑出來的順序才一樣。
// 順序不穩定的話測試寫不了，使用者也會覺得畫面在跳。
export function mergeByTime(...tagged) {
  const all = tagged.flat()
  const dated = all.filter((row) => row.when)
  const undated = all.filter((row) => !row.when)

  // 轉成時間戳再比，不要拿兩個字串比大小。
  // 兩家寫的 offset 只要不一樣，字串比較就會給出錯的順序：
  // 2026-08-23T02:00:00+08:00 看起來大於 2026-08-23T01:00:00Z，
  // 但它換算成 UTC 是前一天 18:00，其實早了七個小時。
  const at = (row) => new Date(row.when).getTime()

  dated.sort((x, y) => {
    const dx = at(x)
    const dy = at(y)
    if (dx !== dy) return dy - dx
    return x.key.localeCompare(y.key)
  })

  return {
    rows: [...dated, ...undated],
    datedCount: dated.length,
    undatedCount: undated.length,
  }
}

// 來源在時間軸上換手幾次。
//
// 這是「合併有沒有意義」的檢查點。如果只換一次，那就是 A 全部排前面
// B 全部排後面，兩家的時間範圍根本沒重疊，排序也就沒示範到東西。
export function countAlternations(rows) {
  let switches = 0
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].key !== rows[index - 1].key) switches += 1
  }
  return switches
}

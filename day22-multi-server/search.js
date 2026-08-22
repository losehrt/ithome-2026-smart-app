// day20：搜尋與分頁。
// 分頁只有一種正確做法：照抄 Bundle.link 裡 relation 為 next 的 URL。
// 自己組 offset 在這台伺服器上行不通，它的 next 是一個 _getpages 的不透明 id。

// 手動跟頁的版本，用來看清楚 link 長什麼樣
export async function fetchAllPagesByHand(client, query) {
  let url = query
  const pages = []
  const resources = []

  while (url) {
    const bundle = await client.request(url)
    const links = Object.fromEntries(
      (bundle.link ?? []).map((link) => [link.relation, link.url])
    )
    pages.push({
      total: bundle.total,
      count: bundle.entry?.length ?? 0,
      relations: Object.keys(links).sort(),
      next: links.next ?? null,
    })
    for (const entry of bundle.entry ?? []) {
      // _include 帶回來的資源 search.mode 是 include，不是 match。
      // 不看這個欄位就會把順便帶回來的 Practitioner 當成一筆用藥。
      if ((entry.search?.mode ?? 'match') === 'match') {
        resources.push(entry.resource)
      }
    }
    url = links.next ?? null
  }

  return { pages, resources }
}

// 平常不必自己跟頁，client.request(query, { pageLimit: 0, flat: true })
// 就跟到底並把 entry 攤平了。上面那個手動版是拿來看清楚 link 怎麼運作的。

// 同一個參數重複出現是 AND，逗號分隔才是 OR。
// date 出現兩次就是兩個條件都要成立，ge 與 le 因此夾出一個區間。
export function dateRangeQuery(patientId, code, from, to) {
  const params = new URLSearchParams()
  params.set('patient', patientId)
  // 用 URLSearchParams 組，system|code 裡的 | 才會被編成 %7C。
  // 自己串字串會踩到這個坑，送出去查不到東西。
  params.set('code', code)
  params.append('date', `ge${from}`)
  params.append('date', `le${to}`)
  params.set('_sort', '-date')
  return `Observation?${params}`
}

// _include 把關聯資源一起帶回來，省掉第二趟往返。
// 回傳分成 match 與 include 兩堆，因為兩者是完全不同的東西。
export async function withIncluded(client, query) {
  const bundle = await client.request(query)
  const byMode = { match: [], include: [] }
  for (const entry of bundle.entry ?? []) {
    byMode[entry.search?.mode ?? 'match']?.push(entry.resource)
  }
  return byMode
}

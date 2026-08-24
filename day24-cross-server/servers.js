// day21：每家醫院一組獨立的 credentials。
// day22：discovery 結果快取起來，不要每次授權都重抓。

export const SERVERS = {
  a: {
    label: 'A 醫院',
    fhirBaseUrl:
      'https://launch.smarthealthit.org/v/r4/sim/WyIzIiwiMDE4ZjQyOGUtMzRmNi00NzA3LTgwMDktNWFkNzQyZjkwMWU3IiwiIiwiQVVUTyIsMCwwLDAsImxhdW5jaC9wYXRpZW50IHBhdGllbnQvKi5ycyBvcGVuaWQgZmhpclVzZXIgb2ZmbGluZV9hY2Nlc3MiLCIiLCJob3NwaXRhbC1hLWNsaWVudCIsIiIsIiIsIiIsIiIsMCwxLCIiXQ/fhir',
    clientId: 'hospital-a-client',
    scope: 'launch/patient patient/*.rs openid fhirUser offline_access',
  },
  b: {
    label: 'B 醫院',
    fhirBaseUrl:
      'https://launch.smarthealthit.org/v/r4/sim/WyIzIiwiYWI0ZTdhN2QtOGIwZC00MWUxLTljZTktMzg3N2Q3NjE1YWVkIiwiIiwiQVVUTyIsMCwwLDAsImxhdW5jaC9wYXRpZW50IHBhdGllbnQvUGF0aWVudC5ycyBwYXRpZW50L09ic2VydmF0aW9uLnJzIiwiIiwiaG9zcGl0YWwtYi1jbGllbnQiLCIiLCIiLCIiLCIiLDAsMSwiIl0/fhir',
    clientId: 'hospital-b-client',
    scope: 'launch/patient patient/Patient.rs patient/Observation.rs',
  },
}

const CACHE_KEY = 'smart-app.discovery'
const TTL_MS = 24 * 60 * 60 * 1000

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

// 快取的 key 是 FHIR base URL 而不是醫院代號，因為同一家醫院換了端點
// 就是換了一台伺服器，舊的快取本來就不該再用。
export async function getConfiguration(server) {
  const cache = readCache()
  const hit = cache[server.fhirBaseUrl]
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) {
    console.log(`[${server.label}] discovery 取自快取`)
    return hit.configuration
  }

  console.log(`[${server.label}] discovery 重抓`)
  try {
    const response = await fetch(
      `${server.fhirBaseUrl}/.well-known/smart-configuration`
    )
    if (!response.ok) {
      throw new Error(`discovery 失敗，HTTP ${response.status}`)
    }
    const configuration = await response.json()

    cache[server.fhirBaseUrl] = { fetchedAt: Date.now(), configuration }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
    return configuration
  } catch (error) {
    // 抓不到的時候，過期的舊值比沒有值好。
    // 伺服器暫時掛掉時舊端點多半還是對的，這時候放棄等於自廢武功。
    if (hit) {
      console.warn(`[${server.label}] discovery 抓不到，改用過期的快取`, error.message)
      return hit.configuration
    }
    throw error
  }
}

export function forgetDiscovery() {
  localStorage.removeItem(CACHE_KEY)
}

export async function discoverEndpoints(fhirBaseUrl) {
  const url = `${fhirBaseUrl}/.well-known/smart-configuration`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`discovery 回了 HTTP ${response.status}`)
  }

  const config = await response.json()

  if (!config.authorization_endpoint || !config.token_endpoint) {
    throw new Error('這台伺服器沒有提供 OAuth 端點')
  }

  return {
    authorize: config.authorization_endpoint,
    token: config.token_endpoint,
    pkceMethods: config.code_challenge_methods_supported ?? [],
    capabilities: config.capabilities ?? [],
  }
}

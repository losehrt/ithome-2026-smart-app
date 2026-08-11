import {
  createPkcePair,
  savePkceVerifier,
  takePkceVerifier,
  randomBase64Url,
} from './pkce.js'

export const CLIENT_ID = 'my-smart-app'
export const SCOPE = 'launch/patient patient/*.rs openid fhirUser offline_access'

const STATE_KEY = 'smart_state'

// redirect_uri 要和換 token 時送的那個一模一樣，所以只在這裡算一次
export function redirectUri() {
  return window.location.origin + window.location.pathname
}

export async function startAuthorization({ endpoints, fhirBaseUrl }) {
  const { verifier, challenge } = await createPkcePair()
  const state = randomBase64Url(32)

  savePkceVerifier(verifier)
  sessionStorage.setItem(STATE_KEY, state)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPE,
    redirect_uri: redirectUri(),
    aud: fhirBaseUrl,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })

  window.location.assign(`${endpoints.authorize}?${params}`)
}

// 讀網址列上授權伺服器送回來的東西
export function readRedirect() {
  const params = new URLSearchParams(window.location.search)
  return {
    code: params.get('code'),
    state: params.get('state'),
    error: params.get('error'),
    errorDescription: params.get('error_description'),
  }
}

export async function completeAuthorization({ endpoints, redirect }) {
  const expectedState = sessionStorage.getItem(STATE_KEY)
  sessionStorage.removeItem(STATE_KEY)

  if (!expectedState || redirect.state !== expectedState) {
    throw new Error('state 對不起來，這次 callback 不是我們發起的')
  }

  const verifier = takePkceVerifier()
  if (!verifier) {
    throw new Error('找不到 code_verifier，授權要重來一次')
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: redirect.code,
    redirect_uri: redirectUri(),
    client_id: CLIENT_ID,
    code_verifier: verifier,
  })

  const response = await fetch(endpoints.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    throw new Error(`換 token 失敗：HTTP ${response.status} ${await response.text()}`)
  }

  return response.json()
}

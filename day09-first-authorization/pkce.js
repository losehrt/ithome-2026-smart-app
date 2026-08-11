const VERIFIER_KEY = 'smart_code_verifier'

// 產生一段 URL 安全的高熵亂數字串
export function randomBase64Url(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return base64UrlEncode(bytes)
}

export async function createPkcePair() {
  const verifier = randomBase64Url(32)
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier)
  )
  const challenge = base64UrlEncode(new Uint8Array(digest))
  return { verifier, challenge }
}

export function savePkceVerifier(verifier) {
  sessionStorage.setItem(VERIFIER_KEY, verifier)
}

// 取出後立刻清掉：verifier 只該被用一次
export function takePkceVerifier() {
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
  return verifier
}

function base64UrlEncode(bytes) {
  const binary = String.fromCharCode(...bytes)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

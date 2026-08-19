// day19：把伺服器丟回來的東西變成一句人看得懂的話。
//
// 最重要的一件事：不是每個錯誤都回 OperationOutcome。
// 這台 sandbox 的 401 回的是 text/plain 的「Invalid token: jwt malformed」，
// 直接 response.json() 會丟出解析例外，使用者最後看到的錯誤會與 401 完全無關。

const BY_STATUS = {
  400: '送出去的內容有問題，請檢查欄位。',
  401: '授權已失效，請重新授權。',
  403: '這個帳號沒有權限做這件事。',
  404: '找不到這筆資料。',
  410: '這筆資料已經被刪除。',
  422: '這筆資料沒通過伺服器的檢查。',
  429: '請求太頻繁，請稍後再試。',
  500: '伺服器出錯了，稍後再試一次。',
  503: '伺服器暫時無法服務，稍後再試一次。',
}

// 可重試的是「再送一次可能就好了」的那些：伺服器忙、網路斷。
// 400 與 422 是自己送錯，重試幾次都一樣。
const RETRIABLE = new Set([429, 500, 502, 503, 504])

export function isRetriable(status) {
  return RETRIABLE.has(status)
}

// OperationOutcome 的 issue 是陣列，一次可能回好幾個問題。
// severity 是 fatal / error / warning / information 四種。
function fromOperationOutcome(payload) {
  if (payload?.resourceType !== 'OperationOutcome') return null
  const issues = payload.issue ?? []
  const blocking = issues.filter(
    (issue) => issue.severity === 'error' || issue.severity === 'fatal'
  )
  const pick = (blocking.length ? blocking : issues)[0]
  if (!pick) return null
  // details.text 是給人看的，diagnostics 常常混著伺服器的內部訊息
  // （這台就會吐 java.io.EOFException），不要直接端給使用者。
  return {
    userMessage: pick.details?.text ?? null,
    developerMessage: pick.diagnostics ?? pick.details?.text ?? null,
    issueCode: pick.code ?? null,
    issueCount: issues.length,
  }
}

export async function describeFailure(response) {
  const status = response.status
  const contentType = response.headers.get('content-type') ?? ''
  const fallback = BY_STATUS[status] ?? `請求失敗，HTTP ${status}。`

  let developerMessage = null
  let issueCode = null
  let issueCount = 0
  let userMessage = null

  // media type 的大小寫不固定，Application/FHIR+JSON 也是合法寫法。
  // 這個正則跟 fhirclient 的 HttpError.parse() 用的是同一個。
  if (/\bjson\b/i.test(contentType)) {
    try {
      const parsed = fromOperationOutcome(await response.json())
      if (parsed) {
        userMessage = parsed.userMessage
        developerMessage = parsed.developerMessage
        issueCode = parsed.issueCode
        issueCount = parsed.issueCount
      }
    } catch {
      developerMessage = '回應宣稱是 JSON 但解不開'
    }
  } else {
    // 純文字的錯誤，多半是授權層在 FHIR 伺服器之前就擋下來了
    developerMessage = (await response.text()).slice(0, 200)
  }

  return {
    status,
    retriable: isRetriable(status),
    // 給使用者的那一句：優先用伺服器的 details.text，
    // 沒有就用我們自己按狀態碼準備的句子。
    userMessage: userMessage ?? fallback,
    // 給開發者的那一句進 console，不上畫面
    developerMessage,
    issueCode,
    issueCount,
  }
}

// client.request() 失敗時丟的是 HttpError，身上有 status 與原始的 response。
// 但別想著去 clone 那個 response：fhirclient 的 checkResponse 在 throw 之前
// 就已經 await 過 HttpError.parse()。parse() 在 Content-Type 是 JSON 或
// text/ 開頭時會讀掉 body，這時候再 clone() 只會丟 TypeError。
// 被讀走的內容沒有消失，它被接在 message 後面：JSON 回應接的是完整的
// JSON.stringify，text/* 接的是純文字。
//
// 所以這條路讀 status 與 message 就夠了。代價是拿不到結構化的 issue，
// issueCode 與 issueCount 固定是 null 與 0。想要 issue 就得自己用 fetch，
// 在讀 body 之前先 clone。
//
// 第三類失敗：斷網、DNS 解不出來、CORS 預檢被擋。
// 這些是 fetch 自己 reject，丟的是 TypeError，連 status 都沒有。
// 這一路一律當成可重試，是簡化的判斷。CORS 設定錯誤也走這裡，
// 那種重試幾次都一樣，正式環境要再細分才不會白重試。
export function describeClientError(error) {
  if (typeof error?.status === 'number') {
    return {
      status: error.status,
      retriable: isRetriable(error.status),
      userMessage: BY_STATUS[error.status] ?? `請求失敗，HTTP ${error.status}。`,
      // message 裡混著伺服器的內部訊息，跟 diagnostics 一樣只進 console
      developerMessage: error.message ?? null,
      issueCode: null,
      issueCount: 0,
    }
  }
  return {
    status: 0,
    retriable: true,
    userMessage: '連不上伺服器，請檢查網路後再試一次。',
    developerMessage: error?.message ?? String(error),
    issueCode: null,
    issueCount: 0,
  }
}

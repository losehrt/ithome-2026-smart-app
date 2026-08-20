// Patient 資源上的欄位幾乎都是選填的。
// 拿到資源不等於拿到資料，每一個要顯示的欄位都得先問「沒有的話怎麼辦」。

const GENDER_LABEL = {
  male: '男',
  female: '女',
  other: '其他',
  unknown: '不明',
}

// name 是陣列，一個人可以有好幾個名字：本名、曾用名、暱稱。
// use 標成 official 的那個才是正式名稱。都沒標就退而求其次拿第一個。
export function displayName(patient) {
  const names = patient.name ?? []
  const official = names.find((one) => one.use === 'official') ?? names[0]
  if (!official) return null

  // text 是「這個名字該怎麼顯示」的完整字串。有就直接用，
  // 自己把 given 接上 family 會把中文姓名的語序排反。
  const text = official.text?.trim()
  if (text) return text

  // 沒有 text 才自己組。given 是陣列，一個人可以有多個 given name。
  const given = official.given?.join(' ') ?? ''
  const family = official.family ?? ''
  return `${given} ${family}`.trim() || null
}

// 回傳的每一欄都可能是 null，呈現層自己決定 null 要顯示成什麼。
// 在這裡就換成「未提供」的話，那三個字會變成一筆看起來正常的值，
// 呼叫端再也分不出它是伺服器給的資料還是這裡塞的預設文案。
export function summarize(patient) {
  return {
    id: patient.id,
    name: displayName(patient),
    gender: GENDER_LABEL[patient.gender] ?? null,
    birthDate: patient.birthDate ?? null,
  }
}

const randomNumber = () => {
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(1)
    cryptoApi.getRandomValues(values)
    return values[0]
  }
  return Math.floor(Math.random() * 0xffffffff)
}

export const ensureStudentNickname = () => {
  const login = uni.getStorageSync('sxb-login') || {}
  const identity = String(login.phone || 'local').replace(/[^a-zA-Z0-9]/g, '') || 'local'
  const key = `sxb-student-nickname-${identity}`
  const saved = uni.getStorageSync(key)
  if (typeof saved === 'string' && /^学生\d{5}[A-Z]$/.test(saved)) return saved

  const issued: string[] = uni.getStorageSync('sxb-issued-nicknames') || []
  let nickname = ''
  do {
    const digits = String(10000 + randomNumber() % 90000)
    const letter = String.fromCharCode(65 + randomNumber() % 26)
    nickname = `学生${digits}${letter}`
  } while (issued.includes(nickname))

  uni.setStorageSync(key, nickname)
  uni.setStorageSync('sxb-issued-nicknames', [...issued, nickname])
  return nickname
}

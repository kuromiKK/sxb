export const backOrFallback = (fallbackUrl: string) => {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  if (pages.length > 1) {
    uni.navigateBack({ delta: 1, fail: () => uni.reLaunch({ url: fallbackUrl }) })
    return
  }
  if (typeof window !== 'undefined' && window.history.length > 1) {
    window.history.back()
    return
  }
  uni.reLaunch({ url: fallbackUrl })
}

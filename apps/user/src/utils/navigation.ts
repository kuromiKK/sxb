const HOME = '/pages/index/index'
const LOGIN = '/pages/login/index'
const HISTORY_KEY = 'sxb-navigation-v1'
let trail: string[] = []
let installed = false
let revision = 0
let returning = false

export function safePageUrl(value: unknown, fallback = HOME): string {
  let url = typeof value === 'string' ? value : ''
  for (let n = 0; n < 2 && /^%2f/i.test(url); n++) {
    try { url = decodeURIComponent(url) } catch { return fallback }
  }
  if (!/^\/pages\/[a-z][a-z-]*\/index(?:\?[^#\r\n]*)?$/.test(url)) return fallback
  const [path, query = ''] = url.split(/\?(.*)/s)
  const params = new URLSearchParams(query)
  // H5 uni-app encodes query values again in the hash; normalize route-valued params.
  for (const key of ['redirect', 'returnUrl']) {
    let value = params.get(key)
    if (value === null) continue
    for (let n = 0; n < 2 && /^%2f/i.test(value); n++) {
      try { value = decodeURIComponent(value) } catch { break }
    }
    params.set(key, value)
  }
  params.sort()
  const encoded = params.toString()
  return path + (encoded ? '?' + encoded : '')
}
function pageUrl(page: any): string {
  if (page?.$page?.fullPath) return safePageUrl(page.$page.fullPath)
  const query = Object.entries(page?.options || {}).map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(String(value))).join('&')
  return safePageUrl('/' + (page?.route || '') + (query ? '?' + query : ''))
}
export function currentPageUrl(): string {
  // #ifdef H5
  if (typeof location !== 'undefined') return safePageUrl(location.hash.slice(1))
  // #endif
  const pages = getCurrentPages()
  return pageUrl(pages[pages.length - 1])
}
function saveTrail() {
  trail = trail.slice(-80)
  // Per-tab history must not leak between tabs or app sessions.
  // #ifdef H5
  try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(trail)) } catch {}
  // #endif
}
function syncTrail() {
  const current = currentPageUrl()
  const index = trail.lastIndexOf(current)
  trail = index >= 0 ? trail.slice(0, index + 1) : [current]
  saveTrail()
}
export function installNavigation() {
  if (installed) return
  installed = true
  // #ifdef H5
  try {
    const saved = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '[]')
    if (Array.isArray(saved)) trail = saved.filter(url => safePageUrl(url, '') === url && url)
  } catch {}
  window.addEventListener('popstate', syncTrail)
  // #endif
  syncTrail()
  for (const method of ['navigateTo', 'redirectTo', 'reLaunch', 'switchTab'] as const) {
    uni.addInterceptor(method, {
      invoke(args: any) {
        syncTrail()
        const previous = [...trail], version = ++revision
        const target = safePageUrl(args.url, '')
        if (!target) return false
        args.url = target
        if (method === 'reLaunch' || method === 'switchTab') trail = [target]
        else if (method === 'redirectTo') trail = [...trail.slice(0, -1), target]
        else if (target !== trail[trail.length - 1]) trail.push(target)
        saveTrail()
        const fail = args.fail
        args.fail = (error: any) => { if (revision === version) { trail = previous; saveTrail() } fail?.(error) }
      },
    })
  }
  uni.addInterceptor('navigateBack', { success: () => { syncTrail() } })
}
export function backOrFallback(fallbackUrl = HOME) {
  if (returning) return
  returning = true
  const release = () => { returning = false }
  const pages = getCurrentPages()
  syncTrail()
  const previous = [...trail]
  const candidate = trail.length > 1 ? trail[trail.length - 2] : safePageUrl(fallbackUrl)
  const source = candidate === currentPageUrl() ? HOME : candidate
  const restore = () => {
    // Reconstruct only a verified in-app source after refresh, never arbitrary browser history.
    uni.redirectTo({ url: source, success: () => { trail = previous.slice(0, -2).concat(source); saveTrail() }, complete: release })
  }
  if (pages.length > 1) uni.navigateBack({ delta: 1, success: release, fail: restore })
  else restore()
}
export function openPage(url: string, complete?: () => void) {
  const target = safePageUrl(url)
  if (target === currentPageUrl()) { complete?.(); return }
  uni.navigateTo({ url: target, complete })
}
export function openTab(url: string, complete?: () => void) {
  const target = safePageUrl(url)
  const pages = getCurrentPages()
  const index = pages.findIndex(page => pageUrl(page) === target)
  if (index >= 0 && index < pages.length - 1) {
    // Reuse top-level tabs instead of exhausting the mini-program's page stack.
    uni.navigateBack({ delta: pages.length - 1 - index, complete })
  } else openPage(target, complete)
}
export function openLogin(target = currentPageUrl(), replace = false) {
  if (currentPageUrl().split('?')[0] === LOGIN) return
  const url = LOGIN + '?redirect=' + encodeURIComponent(safePageUrl(target))
  if (replace) uni.redirectTo({ url })
  else openPage(url)
}
export function finishLoginNavigation(target: string) {
  let url = safePageUrl(target)
  if (url.split('?')[0] === LOGIN) url = HOME
  const pages = getCurrentPages()
  const previous = pages[pages.length - 2]
  if (previous && pageUrl(previous) === url) backOrFallback(url)
  else uni.redirectTo({ url })
}

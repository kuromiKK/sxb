import { onMounted, onUnmounted, ref } from 'vue'

export function useInteraction() {
  const reducedMotion = ref(false)
  // Native haptics are opt-in. H5 deliberately has no vibration fallback.
  const confirmFeedback = () => {
    // #ifdef MP-WEIXIN
    if (uni.getStorageSync('sxb-haptics') === true) uni.vibrateShort({ type: 'light', fail: () => {} })
    // #endif
  }
  // #ifdef H5
  let media: MediaQueryList | undefined
  const update = () => { reducedMotion.value = Boolean(media?.matches) }
  onMounted(() => { media = window.matchMedia('(prefers-reduced-motion: reduce)'); update(); media.addEventListener('change', update) })
  onUnmounted(() => media?.removeEventListener('change', update))
  // #endif
  return { reducedMotion, confirmFeedback }
}

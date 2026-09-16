type ExamYear = { year: number; cutoff?: string | null }
const DAY = 86_400_000

/** Use Beijing calendar days, matching the date-only exam project configuration. */
export function examCountdown(entries: ExamYear[] = [], now = Date.now()) {
  const today = Math.floor((now + 8 * 3_600_000) / DAY)
  const dates = entries.flatMap(entry => {
    if (!entry.cutoff || !/^\d{4}-\d{2}-\d{2}$/.test(entry.cutoff)) return []
    const timestamp = Date.parse(entry.cutoff + 'T00:00:00Z')
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== entry.cutoff) return []
    return [{ ...entry, cutoff: entry.cutoff, day: timestamp / DAY }]
  }).sort((a, b) => a.day - b.day)
  const target = dates.find(entry => entry.day >= today) || dates.at(-1)
  if (!target) return { state: 'unset', days: null, date: '', label: '日期待设置' } as const
  const days = target.day - today
  return {
    state: days > 0 ? 'upcoming' : days === 0 ? 'today' : 'ended',
    days: Math.max(0, days),
    date: target.cutoff,
    label: days > 0 ? '考试倒计时' : days === 0 ? '考试就在今天' : '本期考试已结束'
  } as const
}

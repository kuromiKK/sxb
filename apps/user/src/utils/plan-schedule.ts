export function chinaDate(now: Date | string | number = new Date()) {
  return new Date(new Date(now).getTime() + 8 * 3600000).toISOString().slice(0, 10)
}
export function addDays(day: string, amount: number) {
  const date = new Date(day + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}
export function activeDates(start: string, end: string, rest: number[], skip: string[]) {
  const days: string[] = []
  for (let day = start; day <= end && days.length < 3660; day = addDays(day, 1)) {
    if (!rest.includes(new Date(day + 'T00:00:00Z').getUTCDay()) && !skip.includes(day)) days.push(day)
  }
  return days
}
export function allocate(total: number, dates: string[]) {
  const count = Math.max(0, Math.floor(total))
  return dates.map((date, index) => ({ date, count: Math.floor(count / dates.length) + (index < count % dates.length ? 1 : 0) }))
}
export function schedule(total: number, todayDone: number, dates: string[], today: string, custom: number | null) {
  const allocation = allocate(total + (dates.includes(today) ? todayDone : 0), dates)
  let left = total
  return allocation.map(item => {
    const desired = custom === null ? item.count : custom
    const count = Math.min(left, Math.max(0, desired - (item.date === today ? todayDone : 0)))
    left -= count
    return { date: item.date, count }
  })
}

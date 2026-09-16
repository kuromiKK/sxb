import assert from 'node:assert/strict'
import test from 'node:test'
import { examCountdown } from '../apps/admin/src/utils/exam-countdown.ts'

test('countdown selects the nearest upcoming configured exam, regardless of order', () => {
  const result = examCountdown([
    {year:2027, cutoff:'2027-05-20'},
    {year:2026, cutoff:'2026-09-20'},
    {year:2025, cutoff:'2025-05-20'}
  ], Date.parse('2026-09-09T12:00:00+08:00'))
  assert.equal(result.days, 11)
  assert.equal(result.date, '2026-09-20')
  assert.equal(result.state, 'upcoming')
})

test('Beijing midnight and the exam day never show an extra or negative day', () => {
  const entries = [{year:2026, cutoff:'2026-09-10'}]
  assert.equal(examCountdown(entries, Date.parse('2026-09-09T15:59:59Z')).days, 1)
  assert.equal(examCountdown(entries, Date.parse('2026-09-09T16:00:00Z')).state, 'today')
  assert.equal(examCountdown(entries, Date.parse('2026-09-10T15:59:59Z')).state, 'today')
  assert.equal(examCountdown(entries, Date.parse('2026-09-10T16:00:00Z')).state, 'ended')
  assert.equal(examCountdown(entries, Date.parse('2026-09-10T16:00:00Z')).days, 0)
})

test('missing and invalid dates are unset; past exams use the latest configured date', () => {
  const now = Date.parse('2026-09-09T12:00:00+08:00')
  assert.equal(examCountdown([], now).state, 'unset')
  assert.equal(examCountdown([{year:2026,cutoff:null},{year:2026,cutoff:'2026-02-30'}],now).state,'unset')
  const past = examCountdown([{year:2025,cutoff:'2025-05-20'},{year:2026,cutoff:'2026-05-24'}],now)
  assert.equal(past.state,'ended')
  assert.equal(past.date,'2026-05-24')
})

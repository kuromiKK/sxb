import 'dotenv/config'
import {finishLoginConsent} from './helpers/login-consent.mjs'
import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const adminBase = 'http://127.0.0.1:5180'
const userBase = 'http://127.0.0.1:5174'
const examId = 'junior-social-worker'
const phone = '188' + String(Date.now()).slice(-8)
await mkdir('.local/qa/entitlements', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const errors = []
let cleanup = async () => {}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' })
  const admin = await context.newPage(), student = await context.newPage()
  for (const page of [admin, student]) page.on('pageerror', e => errors.push(e.message))
  await student.setViewportSize({ width: 393, height: 852 })
  await student.goto(`${userBase}/#/pages/login/index`)
  await student.waitForTimeout(1500)
  await student.locator('.field input').nth(0).fill(phone)
  const codeResponse = student.waitForResponse(r => r.url().endsWith('/api/auth/code') && r.status() === 200)
  await student.locator('.code-button').click()
  const { testCode } = await (await codeResponse).json()
  await student.locator('.field input').nth(1).fill(testCode)
  const studentResponse = student.waitForResponse(r => r.url().endsWith('/api/auth/phone') && r.status() === 200)
  await student.locator('.login-button').click()
  const studentSession = await finishLoginConsent(student,await (await studentResponse).json())
  await student.locator('.home').waitFor()
  const studentHeaders = { Authorization: `Bearer ${studentSession.token}` }

  await admin.goto(`${adminBase}/#users`)
  await admin.getByPlaceholder('请输入手机号').fill(process.env.ADMIN_PHONE)
  await admin.getByPlaceholder('请输入密码').fill(process.env.ADMIN_PASSWORD)
  const adminResponse = admin.waitForResponse(r => r.url().endsWith('/api/auth/admin') && r.status() === 200)
  await admin.getByRole('button', { name: '登录', exact: true }).click()
  const { token } = await (await adminResponse).json()
  const adminHeaders = { Authorization: `Bearer ${token}` }
  const endpoint = `${adminBase}/api/admin/users/${studentSession.user.id}/entitlements`
  cleanup = async () => {
    for (const selectedExam of [examId, 'mid-social-worker']) {
      const detail = await (await context.request.get(endpoint+'?examId='+selectedExam, { headers: adminHeaders })).json()
      if (detail.manual && !detail.manual.revoked) {
        const result = await context.request.put(endpoint+'/'+selectedExam, { headers: adminHeaders, data: { action: 'restore', version: detail.version, reason: '浏览器验证完成，恢复测试账号原权益' } })
        assert.equal(result.ok(), true)
      }
    }
  }
  await admin.getByRole('textbox', { name: '搜索用户', exact: true }).fill(phone)
  await admin.getByRole('button', { name: '查询', exact: true }).click()
  const row = admin.locator('.el-table__row').filter({ hasText: phone })
  await expect(row).toHaveCount(1)
  await row.getByRole('button', { name: '人工权益管理', exact: true }).click()
  const dialog = admin.getByRole('dialog', { name: '人工权益管理', exact: true })
  await expect(dialog.locator('.current-level')).toContainText('普通会员')
  await dialog.getByRole('button', { name: '保存权益', exact: true }).click()
  await expect(dialog).toContainText('请填写至少2个字的调整原因')
  await dialog.getByPlaceholder('请说明赠送、补偿或修正权益的原因').fill('【测试】用户管理权益切换')
  await dialog.locator('.el-radio-button').filter({ hasText: /^VIP$/ }).click()
  await dialog.getByRole('button', { name: '保存权益', exact: true }).click()
  await admin.locator('.el-message-box').getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog.locator('.current-level')).toContainText('普通会员')

  for (const [level, label, studentLabel] of [['vip','VIP','VIP'], ['svip','SVIP','SVIP'], ['free','普通会员','普通会员']]) {
    await dialog.getByPlaceholder('请说明赠送、补偿或修正权益的原因').fill(`【测试】切换至${label}`)
    await dialog.locator('.el-radio-button').filter({ hasText: new RegExp(`^${label}$`) }).click()
    await dialog.getByRole('button', { name: '保存权益', exact: true }).click()
    const saved = admin.waitForResponse(r => r.url() === endpoint+'/'+examId && r.request().method() === 'PUT' && r.status() === 200)
    await admin.getByRole('button', { name: '确认生效', exact: true }).click()
    await saved
    await expect(dialog.locator('.current-level')).toContainText(label)
    const actual = await (await context.request.get(`${userBase}/api/rights/${examId}`, { headers: studentHeaders })).json()
    assert.equal(actual.level, level); assert.equal(actual.source, 'manual')
    assert.equal(actual.permissions.reports, level === 'svip')
    assert.equal(actual.permissions.courses, level !== 'free')
    assert.equal((await (await context.request.get(`${userBase}/api/rights/mid-social-worker`, { headers: studentHeaders })).json()).level, 'free')
    assert.deepEqual(await (await context.request.get(`${userBase}/api/orders`, { headers: studentHeaders })).json(), [])
    await student.goto(`${userBase}/#/pages/profile/index`)
    await student.reload()
    await expect(student.locator('.rights-copy > uni-text').first()).toHaveText(studentLabel)
    await student.screenshot({ path: `.local/qa/entitlements/student-${level}.png`, fullPage: true })
    if (level === 'svip') {
      await student.goto(`${userBase}/#/pages/profile-center/index?mode=report`)
      await student.waitForTimeout(1000)
      await student.screenshot({ path: '.local/qa/entitlements/student-report.png', fullPage: true })
      const reports = await (await context.request.get(`${userBase}/api/reports/${examId}`, { headers: studentHeaders })).json()
      assert(reports.length > 0 && reports.every(r => !r.locked))
    }
  }
  for (const width of [1440, 375]) {
    await admin.setViewportSize({ width, height: 1100 })
    await admin.screenshot({ path: `.local/qa/entitlements/admin-${width}.png`, fullPage: true })
    assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
    const bound = await dialog.boundingBox()
    assert(bound.x >= 0 && bound.x+bound.width <= width)
  }
  await admin.setViewportSize({ width: 1440, height: 1100 })
  await dialog.getByPlaceholder('请说明赠送、补偿或修正权益的原因').fill('【测试】恢复原订单权益')
  await dialog.getByRole('button', { name: '恢复订单权益', exact: true }).click()
  await admin.getByRole('button', { name: '确认生效', exact: true }).click()
  await expect(dialog.locator('.current-level')).toContainText('默认权益')
  await expect(dialog.getByRole('button', { name: '恢复订单权益', exact: true })).toBeDisabled()
  // A new selection must not display another exam's history or stale form state.
  await dialog.locator('.el-select').first().click()
  await admin.getByRole('option', { name: '中级社会工作师', exact: true }).click()
  await expect(dialog).toContainText('该考试暂无人工调整记录')
  await expect(dialog.locator('.current-level')).toContainText('普通会员')
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(dialog).toBeHidden()
  assert.deepEqual(errors, [])
  await writeFile('.local/qa/entitlements/results.json', JSON.stringify({ errors, studentId: studentSession.user.id, checkedLevels: ['vip','svip','free'], widths: [1440,375], restored: true }, null, 2))
  console.log('Passed: user search, confirmation/cancel, VIP/SVIP/free, real student UI, exam isolation, no payment fabrication, restore, history, mobile layout.')
} finally { try { await cleanup() } finally { await browser.close() } }

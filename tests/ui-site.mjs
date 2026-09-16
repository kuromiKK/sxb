import 'dotenv/config'
import {finishLoginConsent} from './helpers/login-consent.mjs'
import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const base = 'http://127.0.0.1:5174'
await mkdir('.local/qa/site', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const errors = []
const issues = []
let cleanup = async () => {}
try {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(e.message))
  async function login(phone) {
    await page.goto(`${base}/#/pages/login/index`)
    await page.waitForTimeout(1400)
    await page.locator('.field input').nth(0).fill(phone)
    const response = page.waitForResponse(r => r.url().endsWith('/api/auth/code') && r.status() === 200)
    await page.locator('.code-button').click()
    const { testCode } = await (await response).json()
    await expect(page.locator('.login-tip')).toContainText(testCode)
    await page.locator('.field input').nth(1).fill(testCode)
    const result = page.waitForResponse(r => r.url().endsWith('/api/auth/phone') && r.status() === 200)
    await page.locator('.login-button').click()
    const session = await finishLoginConsent(page,await (await result).json())
    assert.equal(session.user.role, 'student')
    await page.locator('.home').waitFor()
    return session
  }
  // These are explicit local-test accounts; no payment or rights mutation.
  const arbitrary = '188' + String(Date.now()).slice(-8)
  await login(arbitrary)
  const adminStudent = await login(process.env.ADMIN_PHONE)
  assert.equal((await context.request.get(`${base}/api/admin/dashboard`, { headers: { Authorization: `Bearer ${adminStudent.token}` } })).status(), 403)
  const student = await login('13900000001')
  const catalog = await (await context.request.get(`${base}/api/catalog/junior-social-worker`)).json()
  const course = catalog.courseCatalog[0].id
  const reports = await (await context.request.get(`${base}/api/reports/junior-social-worker`, { headers: { Authorization: `Bearer ${student.token}` } })).json()
  const ready = reports.find(r => r.status === 'ready')
  const routes = [
    ['home', '/'], ['courses', '/pages/courses/index'], ['knowledge', '/pages/knowledge/index'],
    ['map', '/pages/knowledge/index?mode=map'], ['knowledge-detail', '/pages/knowledge-detail/index?id=kp-1-1-1'],
    ['recite', '/pages/recite/index'], ['recite-detail', '/pages/recite-detail/index?id=kp-1-1-1'],
    ['course-detail', `/pages/course-detail/index?id=${course}`], ['practice', '/pages/practice/index'],
    ['practice-session', '/pages/practice-session/index?knowledgePointId=kp-1-1-1'],
    ['profile', '/pages/profile/index'], ['security', '/pages/profile-center/index?mode=security'],
    ['rights', '/pages/profile-center/index?mode=rights'], ['orders', '/pages/profile-center/index?mode=orders'],
    ['reports', '/pages/profile-center/index?mode=report'], ['wrong', '/pages/practice-tools/index?mode=wrong'],
    ['notes', '/pages/practice-tools/index?mode=note'], ['favorite', '/pages/practice-tools/index?mode=favorite'],
    ['note-detail', '/pages/note-detail/index'], ['ai-review', '/pages/ai-review/index'],
    ['learning-plan', '/pages/learning-plan/index'], ['exam-notices', '/pages/exam-notices/index'],
    ['article', '/pages/exam-notice-detail/index?id=exam-guide'], ['exam-switch', '/pages/exam-switch/index'],
    ['search', '/pages/search/index'], ['login', '/pages/login/index'],
    ...(ready ? [['monthly-report', `/pages/monthly-report/index?id=${ready.id}`]] : [])
  ]
  for (const width of [375, 430, 1517]) {
    await page.setViewportSize({ width, height: width === 1517 ? 1000 : 932 })
    for (const [name, route] of routes) {
      await page.goto(`${base}/#${route}`)
      await page.waitForTimeout(700)
      if (name === 'map') {
        await page.locator('.mode-item').filter({ hasText: '重点导图' }).click()
        await expect(page.locator('.mind-map-view')).toBeVisible()
        await page.screenshot({ path: `.local/qa/site/mindmap-${width}.png`, fullPage: true })
        await page.locator('.debug-trigger').click()
        await page.getByText('方案二 · 重点知识路线', { exact: true }).click()
        await expect(page.locator('.route-view')).toBeVisible()
        await page.screenshot({ path: `.local/qa/site/knowledge-route-${width}.png`, fullPage: true })
        await page.locator('.debug-trigger').click()
        await page.getByText('方案一 · 节级思维导图', { exact: true }).click()
      }
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) issues.push(`${name}: horizontal overflow ${width}`)
      const small = await page.locator('uni-text > span').evaluateAll(els => els.filter(el => el.getBoundingClientRect().height && !el.closest('.uni-icons,.report-slide,.app-tabbar,.debug-menu') && parseFloat(getComputedStyle(el).fontSize) < 11.5).slice(0,8).map(el => ({ text: el.textContent.slice(0,24), font: getComputedStyle(el).fontSize })))
      if (small.length) issues.push({ page: name, width, small })
      if (['home', 'courses', 'login', 'profile', 'knowledge', 'practice-session', 'article', 'rights', 'monthly-report'].includes(name)) await page.screenshot({ path: `.local/qa/site/${name}-${width}.png`, fullPage: true })
    }
    console.log(`Inspected ${routes.length} routes at ${width}px`)
  }
  const admin = await context.newPage()
  admin.on('pageerror', e => errors.push(e.message))
  await admin.setViewportSize({ width: 1440, height: 1000 })
  await admin.goto('http://127.0.0.1:5180/#administrators')
  await admin.getByPlaceholder('请输入手机号').fill(process.env.ADMIN_PHONE)
  await admin.getByPlaceholder('请输入密码').fill(process.env.ADMIN_PASSWORD)
  const adminLogin = admin.waitForResponse(r => r.url().endsWith('/api/auth/admin') && r.status() === 200)
  await admin.getByRole('button', { name: '登录', exact: true }).click()
  const adminSession = await (await adminLogin).json()
  const adminHeaders = { Authorization: `Bearer ${adminSession.token}` }
  // Recover test-only accounts from interrupted previous runs; never touch real admins.
  const previous = await (await context.request.get(`${base}/api/admin/administrators?search=${encodeURIComponent('【测试】管理界面验证')}`, { headers: adminHeaders })).json()
  for (const account of previous.items.filter(item => item.enabled && /^【测试】管理界面验证\d+$/.test(item.nickname))) {
    await context.request.patch(`${base}/api/admin/administrators/${account.id}`, { headers: adminHeaders, data: { nickname: account.nickname, role: 'superadmin', enabled: false } })
  }
  await expect(admin.locator('.administrator-management')).toBeVisible()
  await expect(admin.locator('.administrator-management')).toContainText(process.env.ADMIN_PHONE)
  await admin.getByRole('button', { name: '新增管理员', exact: true }).click()
  await admin.getByRole('button', { name: '保存管理员', exact: true }).click()
  await expect(admin.getByText('请填写管理员姓名', { exact: true })).toBeVisible()
  await admin.screenshot({ path: '.local/qa/site/admin-create.png' })
  const testName = `【测试】管理界面验证${Date.now()}`
  const dialog = admin.getByRole('dialog', { name: '新增管理员' })
  await dialog.getByPlaceholder('管理员姓名').fill(testName)
  await dialog.getByPlaceholder('管理员手机号').fill(arbitrary)
  const password = `Test${crypto.randomUUID()}`
  await dialog.getByPlaceholder('10至128位，包含字母和数字').fill(password)
  await dialog.getByPlaceholder('再次输入密码').fill(password)
  const createdResponse = admin.waitForResponse(r => r.url().endsWith('/api/admin/administrators') && r.status() === 201)
  await dialog.getByRole('button', { name: '保存管理员', exact: true }).click()
  const created = await (await createdResponse).json()
  cleanup = async () => {
    const response = await context.request.patch(`${base}/api/admin/administrators/${created.id}`, { headers: adminHeaders, data: { nickname: created.nickname, role: 'superadmin', enabled: false } })
    assert.equal(response.ok(), true, 'Disable UI-test administrator after run')
  }
  await expect(dialog).toBeHidden()
  await admin.getByPlaceholder('搜索姓名或手机号').fill(arbitrary)
  await admin.getByRole('button', { name: '搜索管理员', exact: true }).click()
  const row = admin.locator('.el-table__row').filter({ hasText: testName }).first()
  await row.getByRole('button', { name: '编辑管理员', exact: true }).click()
  const editDialog = admin.getByRole('dialog', { name: '编辑管理员' })
  await editDialog.locator('.el-switch').click()
  await editDialog.getByRole('button', { name: '保存管理员', exact: true }).click()
  await expect(editDialog).toBeHidden()
  await expect(row).toContainText('停用')
  await admin.getByPlaceholder('搜索姓名或手机号').fill('')
  await admin.getByRole('button', { name: '搜索管理员', exact: true }).click()
  for (const width of [1440, 375]) {
    await admin.setViewportSize({ width, height: 1000 })
    await admin.screenshot({ path: `.local/qa/site/admin-accounts-${width}.png`, fullPage: true })
    assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
  }
  await admin.goto('http://127.0.0.1:5180/#roles')
  await expect(admin.locator('.view-content')).toContainText('最高管理员')
  await writeFile('.local/qa/site/results.json', JSON.stringify({ issues, errors }, null, 2))
  assert.deepEqual(errors, [])
  assert.deepEqual(issues, [])
  console.log(JSON.stringify(issues))
} finally { try { await cleanup() } finally { await browser.close() } }

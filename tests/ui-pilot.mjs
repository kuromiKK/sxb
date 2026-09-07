import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const base = 'http://127.0.0.1:5174'
const homeSource = 'apps/user/src/pages/index/index.vue'
const original = execFileSync('git', ['show', `1b02c5f:${homeSource}`], { encoding: 'utf8' })
const current = await readFile(homeSource, 'utf8')
const promoLine = source => source.split('\n').find(line => line.trim().startsWith('<view class="promo"')).trim()
assert.equal(promoLine(current), promoLine(original), 'Protected promo markup must remain identical')
const promoStyle = source => source.split('\n').find(line => line.startsWith('.promo {')).trim()
assert.equal(promoStyle(current), promoStyle(original), 'Protected promo styles must remain identical')
await mkdir('.local/qa/pilot', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const errors = []
try {
  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, hasTouch: true })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(base)
  await page.locator('.home').waitFor()
  await expect(page.locator('.uni-toast')).toBeHidden({ timeout: 20000 })
  await page.waitForTimeout(1800)
  const promoMetrics = () => page.locator('.home > .promo').evaluate(el => {
    const s = getComputedStyle(el)
    return { width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, background: s.backgroundImage }
  })
  const protectedMetrics = await promoMetrics()
  for (const size of [{ width: 375, height: 812 }, { width: 393, height: 852 }, { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 932, height: 430 }]) {
    await page.setViewportSize(size)
    for (const [route, root] of [['/', '.home'], ['/pages/courses/index', '.courses-page']]) {
      await page.goto(`${base}/#${route}`)
      await page.locator(root).waitFor()
      await page.waitForTimeout(800)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${root} horizontal overflow at ${size.width}`)
      const targets = root === '.home' ? '.start-button, .plan-button, .plan-edit, .search-button' : '.subject-chip, .chapter-header, .promo-toggle, .full-button'
      const tooSmall = await page.locator(targets).evaluateAll(els => els.filter(el => el.getBoundingClientRect().height < 43.9).map(el => el.className))
      assert.deepEqual(tooSmall, [], `${root} small touch targets`)
      const font = await page.locator(root === '.home' ? '.action-name' : '.lesson-name > uni-text:last-child').first().evaluate(el => getComputedStyle(el).fontSize)
      assert.equal(font, '15px', 'Item titles stay readable independently of width')
      await page.screenshot({ path: `.local/qa/pilot/${root.slice(1)}-${size.width}.png`, fullPage: true })
    }
  }
  await page.setViewportSize({ width: 430, height: 932 })
  const firstChapter = page.locator('.chapter-header').first()
  await firstChapter.click()
  await expect(firstChapter).toHaveAttribute('aria-expanded', 'false')
  await firstChapter.click()
  await expect(firstChapter).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.section-list')).toBeVisible()
  await page.locator('.subject-chip').nth(1).click()
  await expect(page.locator('.subject-chip').nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.chapter-header').first()).toHaveAttribute('aria-expanded', 'true')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(await page.locator('.section-list').evaluate(el => getComputedStyle(el).animationName), 'none')
  await page.goto(`${base}/#/`)
  await page.locator('.home').waitFor()
  await page.waitForTimeout(1000)
  assert.deepEqual(await promoMetrics(), protectedMetrics, 'Course styles must not leak into protected home promo')
  if (await page.locator('.report-pagination').count()) {
    await page.getByRole('button', { name: '下一个月报' }).click()
    await expect(page.locator('.report-position')).toHaveText('2 / 2')
    await page.getByRole('button', { name: '上一个月报' }).click()
    await expect(page.locator('.report-position')).toHaveText('1 / 2')
    await page.locator('.home-report-swiper').scrollIntoViewIfNeeded()
    const box = await page.locator('.home-report-swiper').boundingBox()
    const cdp = await page.context().newCDPSession(page)
    const y = box.y + 65
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 310, y }] })
    for (const x of [270, 220, 170, 120, 70]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(page.locator('.report-position')).toHaveText('2 / 2')
  }
  assert.deepEqual(errors, [])
  console.log('Pilot passed: protected promo unchanged, 5 viewports, stable typography, touch sizes, chapter/subject switching, report buttons and touch swipe, reduced motion, no page errors.')
} finally { await browser.close() }

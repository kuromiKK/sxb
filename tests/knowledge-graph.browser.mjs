import 'dotenv/config'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import ExcelJS from 'exceljs'

// Read-only regression against the running local service; writes only downloaded QA artifacts.
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1733,height:1272},acceptDownloads:true})
const errors=[]
page.on('pageerror',error=>errors.push(error.message))
const output=resolve('.local/qa/knowledge-graph')
await mkdir(output,{recursive:true})
try {
  await page.goto('http://127.0.0.1:5180/#knowledge-graph')
  await page.getByPlaceholder('请输入手机号').fill(process.env.ADMIN_PHONE)
  await page.getByPlaceholder('请输入密码').fill(process.env.ADMIN_PASSWORD)
  await page.getByRole('button',{name:'登录',exact:true}).click()
  await page.locator('.exam-card').first().click()
  await expect(page.locator('.content-item')).toHaveCount(1)
  await expect(page.locator('.knowledge-meta small').first()).toHaveText('12道题')
  await expect(page.locator('.summary-stats')).toContainText('当前VIP学生')
  await expect(page.locator('.summary-stats>div').nth(2)).toHaveText('32知识点')
  const actions=await page.locator('.heading-actions>button').allTextContents()
  assert.deepEqual(actions.map(t=>t.trim()).filter(Boolean),['导出','返回'])

  // Verify audio/article variants by navigating the visible catalog.
  await page.getByRole('button',{name:'第2节 核心考点',exact:true}).click()
  await expect(page.locator('.content-item')).toHaveCount(1)
  await expect(page.locator('.course-meta')).toHaveText('音频36分钟')
  await page.getByRole('button',{name:'第2章 基础知识',exact:true}).click()
  await page.locator('.chapter-group').nth(1).locator('.section-row').first().click()
  await expect(page.locator('.course-meta')).toHaveText('图文')
  await expect(page.locator('.content-item')).toHaveCount(1)

  const downloadPromise=page.waitForEvent('download')
  await page.getByRole('button',{name:'导出知识图谱 Excel',exact:true}).click()
  const download=await downloadPromise
  assert.equal(await download.failure(),null)
  const file=resolve(output,download.suggestedFilename())
  await download.saveAs(file)
  const workbook=new ExcelJS.Workbook()
  await workbook.xlsx.readFile(file)
  const sheet=workbook.worksheets[0]
  assert.equal(sheet.rowCount,33)
  assert.equal(sheet.columnCount,6)
  assert.deepEqual(sheet.getRow(1).values.slice(1),['L1 考试分类','L2 考试项目','L3 科目','L4 章','L5 节','L6 知识点'])
  assert.equal(sheet.getCell('B2').value,await page.locator('.summary-main h2').innerText())
  assert.equal(sheet.getCell('C33').value,'实务方法')
  assert.equal(sheet.getCell('F33').value,'章节要点回顾')
  assert.ok(String(sheet.getCell('E2').value).length>30)
  const cover=await page.locator('.summary-cover').boundingBox()
  const stats=await page.locator('.summary-stats').boundingBox()
  assert.equal(cover.height,stats.height)
  await page.screenshot({path:resolve(output,'detail.png'),fullPage:true})
  await page.getByRole('button',{name:'返回考试列表',exact:true}).click()
  await expect(page.getByRole('button',{name:'导出知识图谱 Excel',exact:true})).toHaveCount(0)
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({passed:true,download:file,dataRows:sheet.rowCount-1,levels:6,courseTypes:['video','audio','article'],coverHeight:cover.height}))
} finally {await browser.close()}

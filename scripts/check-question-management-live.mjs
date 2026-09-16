import 'dotenv/config'
import assert from 'node:assert/strict'
import {chromium,expect} from '@playwright/test'
import ExcelJS from 'exceljs'
const response=await fetch('http://127.0.0.1:4310/api/auth/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:process.env.ADMIN_PHONE,password:process.env.ADMIN_PASSWORD})})
assert.equal(response.status,200)
const {token}=await response.json(),headers={Authorization:'Bearer '+token}
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
  const page=await browser.newPage({viewport:{width:1733,height:1100}}),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(t=>sessionStorage.setItem('sxb-admin-token',t),token)
  await page.goto('http://127.0.0.1:5180/#question')
  const manager=page.locator('.question-manager')
  await expect(manager.locator('thead th .cell')).toHaveText(['标题','知识点','题型','状态','更新时间','操作'])
  await expect(manager.locator('tbody tr').first()).toBeVisible()
  await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0)
  await page.screenshot({path:'.local/qa/question-management/live-question-list.png',fullPage:true})
  const r=await fetch('http://127.0.0.1:4310/api/admin/content?kind=question&typeId=single&status=published',{headers}),data=await r.json()
  assert.equal(r.status,200);assert.ok(data.total>0);assert.ok(data.items.every(q=>q.status==='published'&&(q.payload.templateId||q.payload.type)==='single'))
  const file=await fetch('http://127.0.0.1:4310/api/admin/question-type-imports/file?typeId=single&mode=template',{headers})
  assert.equal(file.status,200);const w=new ExcelJS.Workbook();await w.xlsx.load(Buffer.from(await file.arrayBuffer()))
  assert.ok(w.getWorksheet('题目').getRow(1).values.some(v=>String(v).startsWith('选项 A')))
  await page.setViewportSize({width:1280,height:900})
  const controls=await manager.locator('.admin-filters .el-input__wrapper,.admin-filters .el-select__wrapper').evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().top)))
  assert.ok(controls.every(y=>y===controls[0]),JSON.stringify(controls))
  const button=await manager.getByRole('button',{name:'查询',exact:true}).boundingBox();assert.equal(Math.round(button.y),controls[0])
  await page.screenshot({path:'.local/qa/question-management/live-question-list-1280.png',fullPage:true})
  await expect(page.locator('.heading-actions .el-button')).toHaveText(['','新增题目','导入','导出'])
  await page.setViewportSize({width:1733,height:1100})
  await manager.getByRole('button',{name:'编辑题目'}).first().click()
  const editor=page.locator('.editor-drawer:visible')
  await editor.getByRole('button',{name:'选择知识点',exact:true}).click()
  const picker=page.getByRole('dialog',{name:'选择关联知识点',exact:true})
  await expect(picker.locator('.kp-option').first()).toBeVisible()
  await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0)
  await page.screenshot({path:'.local/qa/question-management/live-knowledge-picker.png',animations:'disabled'})
  await picker.getByRole('button',{name:'取消',exact:true}).click()
  await editor.getByRole('button',{name:'取消',exact:true}).click()
  assert.deepEqual(errors,[])
  console.log(`Live site verified: six columns, filters active (${data.total} published single-choice questions), separate option columns, one-row controls at 1280px. No content writes.`)
}finally{await browser.close();await fetch('http://127.0.0.1:4310/api/auth/logout',{method:'POST',headers})}

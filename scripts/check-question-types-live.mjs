import 'dotenv/config'
import {chromium,expect} from '@playwright/test'
import assert from 'node:assert/strict'
const login=await fetch('http://127.0.0.1:4310/api/auth/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:process.env.ADMIN_PHONE,password:process.env.ADMIN_PASSWORD})})
assert.equal(login.status,200)
const {token}=await login.json()
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
  const page=await browser.newPage({viewport:{width:1733,height:1100}})
  await page.addInitScript(t=>sessionStorage.setItem('sxb-admin-token',t),token)
  await page.goto('http://127.0.0.1:5180/#question-types')
  const headers={Authorization:'Bearer '+token}
  const types=await (await fetch('http://127.0.0.1:4310/api/admin/question-types',{headers})).json()
  assert.ok(types.length>=4)
  await expect(page.locator('.qt-card')).toHaveCount(types.length)
  await expect(page.locator('.qt-title').first()).toHaveText('单选题')
  await page.screenshot({path:'.local/qa/question-types/live-library.png',fullPage:true})
  await page.getByRole('button',{name:'编辑主观题',exact:true}).click()
  await expect(page.locator('.qt-builder')).toBeVisible()
  await page.locator('.qt-block').filter({has:page.locator('.qt-block-caption',{hasText:'主观作答'})}).first().locator('.qt-block-select').click()
  await expect(page.locator('.qt-grading-option .el-switch')).toBeVisible()
  await expect(page.getByRole('switch',{name:'AI 判分',exact:true})).toBeAttached()
  await page.screenshot({path:'.local/qa/question-types/live-designer.png',fullPage:true})
  console.log(`Live site verified: ${types.length} types, subjective AI switch visible, ${types.reduce((sum,t)=>sum+t.question_count,0)} questions; no content writes.`)
}finally{await browser.close();await fetch('http://127.0.0.1:4310/api/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+token}})}

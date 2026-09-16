import assert from 'node:assert/strict'
import {chromium,expect} from '@playwright/test'
import {profileFixture} from './helpers/user-profile-fixture.ts'

const f=await profileFixture()
let browser
try {
  async function create(phone,nickname) {
    const r=await fetch(f.origin+'/api/admin/administrators',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+f.token},body:JSON.stringify({phone,nickname,password:'Delete-Test-1234!'})})
    assert.equal(r.status,201)
    return r.json()
  }
  await create('18600513966','受保护管理员')
  const target=await create('18811112222','待删除管理员')
  browser=await chromium.launch({channel:'chrome',headless:true})
  const context=await browser.newContext({viewport:{width:1440,height:1000}})
  await context.addInitScript(token=>sessionStorage.setItem('sxb-admin-token',token),f.token)
  await context.route('**/api/**',async route=>{
    const u=new URL(route.request().url())
    if(!u.pathname.startsWith('/api/'))return route.continue()
    await route.fulfill({response:await route.fetch({url:f.origin+u.pathname+u.search})})
  })
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://127.0.0.1:5180/#administrators')
  const table=page.locator('.administrator-management')
  await expect(table.getByRole('button',{name:'受保护账号，不能删除',exact:true})).toBeDisabled()
  await expect(table.getByRole('button',{name:'不能删除当前登录账号',exact:true})).toBeDisabled()
  const row=table.locator('tr').filter({hasText:'18811112222'})
  await row.getByRole('button',{name:'删除管理员',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'删除管理员',exact:true})
  await expect(dialog).toContainText('18811112222')
  await dialog.getByRole('button',{name:'取消',exact:true}).click()
  await expect(row).toBeVisible()
  assert.equal((await f.call('/admin/administrators?search=18811112222')).total,1)
  await row.getByRole('button',{name:'删除管理员',exact:true}).click()
  await dialog.getByRole('button',{name:'确认删除',exact:true}).click()
  await expect(row).toHaveCount(0)
  assert.equal((await f.call('/admin/administrators?search=18811112222')).total,0)
  assert((await f.db.query('SELECT admin_deleted_at FROM users WHERE id=$1',[target.id])).rows[0].admin_deleted_at)
  assert.deepEqual(errors,[])
  console.log('PASS: protected/current account disabled, confirmation, cancel, delete, list refresh; isolated database only')
} finally {await browser?.close();await f.close()}

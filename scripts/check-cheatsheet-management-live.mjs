import 'dotenv/config'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'
const origin='http://127.0.0.1:4310',output='.local/qa/cheatsheet-management'
await mkdir(output,{recursive:true})
const response=await fetch(origin+'/api/auth/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:process.env.ADMIN_PHONE,password:process.env.ADMIN_PASSWORD})});assert.equal(response.status,200)
const {token}=await response.json(),headers={Authorization:'Bearer '+token}
const records=await fetch(origin+'/api/admin/cheatsheets',{headers});assert.equal(records.status,200);const data=await records.json()
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:2097,height:1272}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(t=>sessionStorage.setItem('sxb-admin-token',t),token)
 await page.goto('http://127.0.0.1:5180/#cheatsheet');const manager=page.locator('.cheatsheet-management');await expect(manager).toBeVisible();await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0)
 assert.deepEqual(await manager.locator('thead th').allTextContents(),['标题','考试项目','状态','开放时间至关闭时间','推送状态','更新时间','操作'])
 await page.screenshot({path:output+'/live-list.png',animations:'disabled'})
 await page.setViewportSize({width:1280,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:output+'/live-1280.png',animations:'disabled'})
 await page.setViewportSize({width:1733,height:1100})
 if(data.total)await manager.getByRole('button',{name:'编辑小抄'}).first().click();else await page.getByRole('button',{name:'新增考前小抄',exact:true}).click()
 const editor=page.locator('.editor-drawer:visible');await expect(editor.getByRole('button',{name:'插入图片',exact:true})).toBeVisible();await editor.getByRole('button',{name:'插入图片',exact:true}).click();const insert=page.getByRole('dialog',{name:'插入资源',exact:true});await expect(insert.getByText('上传文件',{exact:true})).toBeVisible();await expect(insert.getByText('HTTPS 外链',{exact:true})).toBeVisible();await page.screenshot({path:output+'/live-image-dialog.png',animations:'disabled'});await insert.getByRole('button',{name:'取消',exact:true}).click();await editor.getByRole('button',{name:'取消',exact:true}).click()
 await page.goto('http://127.0.0.1:5180/#exam-categories');await page.getByRole('button',{name:'新增分类',exact:true}).click();const category=page.getByRole('dialog',{name:'新增分类',exact:true});await expect(category.getByRole('button',{name:'插入图片',exact:true})).toBeVisible();await category.getByRole('button',{name:'返回',exact:true}).click()
 await page.goto('http://127.0.0.1:5180/#cheatsheet');await expect(manager).toBeVisible();await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0)
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',liveRows:data.total,list:true,responsive:true,imageToolbar:true,contentWrites:0,pushes:0}))
}finally{await browser.close()}

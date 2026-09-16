import 'dotenv/config'
import assert from 'node:assert/strict'
import {chromium,expect} from '@playwright/test'
import {mkdir} from 'node:fs/promises'
const output='.local/qa/knowledge-list'
await mkdir(output,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:1974,height:1272},permissions:['clipboard-read','clipboard-write'],reducedMotion:'reduce'})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:5180/#knowledge-graph')
 await page.getByPlaceholder('请输入手机号').fill(process.env.ADMIN_PHONE);await page.getByPlaceholder('请输入密码').fill(process.env.ADMIN_PASSWORD);await page.getByRole('button',{name:'登录',exact:true}).click()
 const response=page.waitForResponse(r=>r.url().includes('/admin/knowledge-structure/'))
 await page.locator('.grid button').filter({hasText:'初级社会工作师'}).click()
 const structure=await(await response).json()
 const manager=page.locator('.knowledge-list-manager')
 await expect(manager.locator('.el-table__row').first()).toBeVisible()
 const copy=page.locator('.exam-heading .record-identifier')
 await expect(copy).toHaveText(/\(ID：junior-social-worker-\d+\)/)
 await copy.click();const number=await page.evaluate(()=>navigator.clipboard.readText());assert.match(number,/^junior-social-worker-\d+$/)
 const choose=async(label,option)=>{await manager.locator('.el-select').filter({has:page.getByRole('combobox',{name:label,exact:true})}).click();await page.getByRole('option',{name:option,exact:true}).click()}
 const s=structure.subjects[0],c=s.chapters[0],t=c.sections[0]
 await choose('筛选科目',s.title)
 await manager.locator('.el-select').filter({has:page.getByRole('combobox',{name:'筛选章',exact:true})}).click()
 await expect(page.locator('.el-select-dropdown:visible .el-select-dropdown__item')).toHaveCount(s.chapters.length+1)
 await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').nth(1).click()
 await manager.locator('.el-select').filter({has:page.getByRole('combobox',{name:'筛选节',exact:true})}).click()
 await expect(page.locator('.el-select-dropdown:visible .el-select-dropdown__item')).toHaveCount(c.sections.length+1)
 await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').nth(1).click()
 await expect(manager.locator('.pagination')).toContainText('共 '+t.knowledge.length+' 条内容')
 const paths=await manager.locator('.el-table__row .cell-sub').allTextContents();assert(paths.every(p=>p==='1-1-1'))
 if(structure.subjects[1])await choose('筛选科目',structure.subjects[1].title)
 await expect(manager.locator('.el-select').filter({has:page.getByRole('combobox',{name:'筛选章',exact:true})})).toContainText('全部章')
 await expect(manager.locator('.el-select').filter({has:page.getByRole('combobox',{name:'筛选节',exact:true})})).toContainText('全部节')
 await manager.getByRole('button',{name:'重置',exact:true}).click()
 await choose('筛选配套课','有')
 const expectedCourses=structure.subjects.flatMap(s=>s.chapters.flatMap(c=>c.sections.flatMap(t=>t.knowledge))).filter(k=>k.courses.length).length
 await expect(manager.locator('.pagination')).toContainText('共 '+expectedCourses+' 条内容')
 await manager.getByRole('button',{name:'重置',exact:true}).click()
 await choose('筛选状态','已发布')
 assert((await manager.locator('tbody .el-tag').allTextContents()).filter(t=>['草稿','审核中','停用'].includes(t)).length===0)
 await manager.getByRole('button',{name:'重置',exact:true}).click()
 for(const level of ['知识点','节','章','科目']){
  await manager.locator('.el-radio-button').filter({hasText:new RegExp('^'+level+'$')}).click()
  await expect(manager.getByRole('combobox',{name:'筛选精品课',exact:true})).toHaveCount(level==='节'?1:0)
  await expect(manager.getByRole('combobox',{name:'筛选配套课',exact:true})).toHaveCount(level==='知识点'?1:0)
  await page.screenshot({path:output+'/'+level+'.png'})
 }
 await manager.locator('.el-radio-button').filter({hasText:/^知识点$/}).click()
 const long=structure.rows.find(r=>r.kind==='knowledge'&&Array.from(r.title).length>50)
 if(long){await manager.getByPlaceholder('搜索标题',{exact:true}).fill(long.title);const title=manager.getByRole('button',{name:long.title,exact:true});await expect(title).toHaveText(Array.from(long.title).slice(0,50).join('')+'...');await title.focus();await expect(page.getByRole('tooltip',{name:long.title,exact:true})).toBeVisible();await manager.getByRole('button',{name:'重置',exact:true}).click()}
 await manager.locator('.el-table__row').first().getByRole('button',{name:'编辑内容'}).click()
 await expect(page.locator('.el-drawer:visible .record-identifier')).toContainText(/-\d+/)
 await page.locator('.el-drawer:visible').getByRole('button',{name:'取消',exact:true}).click()
 await page.setViewportSize({width:390,height:1000});await page.screenshot({path:output+'/mobile.png'})
 assert(await manager.locator('.knowledge-filters').evaluate(e=>e.scrollWidth<=e.clientWidth+1))
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({status:'PASS',displayId:number,cascade:true,courseFilterScope:true,longTitle:!!long,contentWrites:0}))
}finally{await browser.close()}

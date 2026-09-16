import 'dotenv/config'
import assert from 'node:assert/strict'
import {chromium,expect} from '@playwright/test'
import {mkdir} from 'node:fs/promises'

const origin='http://127.0.0.1:4310/api'
const login=await fetch(origin+'/auth/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:process.env.ADMIN_PHONE,password:process.env.ADMIN_PASSWORD})})
assert.equal(login.status,200)
const {token}=await login.json(),headers={Authorization:'Bearer '+token}
const nodes=await(await fetch(origin+'/admin/content?kind=knowledge&examId=junior-social-worker',{headers})).json()
assert(nodes.items.length)
const node=nodes.items[0],browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:1680,height:1100},reducedMotion:'reduce'}),errors=[],failures=[],reads=[]
 page.on('pageerror',e=>errors.push(e.message))
 page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/api/')&&r.status()>=400)failures.push(r.status()+' '+new URL(r.url()).pathname.split('/').slice(0,3).join('/'))})
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname
  if(!path.startsWith('/api/'))return route.continue()
  assert(req.method()==='GET'||req.method()==='POST'&&path.startsWith('/api/admin/content-preview/'),'Unexpected business mutation')
  if(req.frame()!==page.mainFrame()){assert(path.startsWith('/api/content-preview/'));assert.equal(req.headers().authorization,undefined);reads.push(path.split('/').slice(0,3).join('/'))}
  await route.continue()
 })
 await page.addInitScript(t=>sessionStorage.setItem('sxb-admin-token',t),token)
 await page.goto('http://127.0.0.1:5180/#knowledge-graph')
 await page.locator('.grid button').filter({hasText:'初级社会工作师'}).click()
 const manager=page.locator('.knowledge-list-manager'),frame=page.frameLocator('iframe[title="用户端内容预览"]')
 await manager.getByPlaceholder('搜索标题',{exact:true}).fill(node.title)
 await manager.getByRole('button',{name:'预览内容',exact:true}).first().click()
 await expect(frame.locator('.hero-title')).toHaveText(node.title)
 await expect(frame.locator('.content-card')).toBeVisible()
 await mkdir('.local/qa/content-preview',{recursive:true})
 await page.screenshot({path:'.local/qa/content-preview/live-knowledge.png',animations:'disabled'})
 await page.locator('.content-preview-drawer:visible .el-drawer__close-btn').click()
 await manager.getByPlaceholder('搜索标题',{exact:true}).fill('')
 await manager.locator('.el-radio-button').filter({hasText:/^节$/}).click()
 await manager.getByRole('button',{name:'预览内容',exact:true}).first().click()
 await expect(frame.locator('.hero-title')).toBeVisible()
 await expect(frame.getByText('节正文',{exact:true})).toBeVisible()
 await page.screenshot({path:'.local/qa/content-preview/live-section.png',animations:'disabled'})
 assert(reads.length);assert.deepEqual(errors,[]);assert.deepEqual(failures,[])
 const publicRows=await(await fetch(origin+'/admin/content?kind=knowledge&examId=junior-social-worker&status=published',{headers})).json()
 const publicNode=publicRows.items[0];assert(publicNode)
 const studentPage=await browser.newPage({viewport:{width:390,height:844}})
 studentPage.on('pageerror',e=>errors.push(e.message))
 await studentPage.route('**/api/**',route=>{assert.equal(route.request().method(),'GET');return route.continue()})
 await studentPage.goto('http://127.0.0.1:5174/#/pages/knowledge-detail/index?id='+encodeURIComponent(publicNode.id))
 await expect(studentPage.locator('.hero-title')).toHaveText(publicNode.title)
 await expect(studentPage.locator('.content-card')).toBeVisible()
 await expect(studentPage.getByText('我的笔记',{exact:true})).toBeVisible()
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({status:'PASS',liveKnowledge:true,liveSection:true,normalKnowledgeDetail:true,businessWrites:0,noStudentRequestsInPreview:true}))
}finally{await browser.close()}

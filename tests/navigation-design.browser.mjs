import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFile,mkdir} from 'node:fs/promises'
import {resolve,extname,sep} from 'node:path'
import {chromium,expect} from '@playwright/test'
import {profileFixture} from './helpers/user-profile-fixture.ts'

// Isolated API fixture: never sends SMS or changes the developer's database.
const f=await profileFixture(),root=resolve('apps/user/dist/build/h5')
const server=createServer(async(req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)
 const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname))
 if(!file.startsWith(root+sep)){res.writeHead(403).end();return}
 try{const content=await readFile(file);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.woff2':'font/woff2','.ttf':'font/ttf'})[extname(file)]||'application/octet-stream');res.end(content)}catch{res.writeHead(404).end()}
})
server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r))
let browser
try {
 browser=await chromium.launch({channel:'chrome',headless:true})
 const context=await browser.newContext({viewport:{width:375,height:812},reducedMotion:'reduce'})
 await context.addInitScript(({token,exam})=>{localStorage.setItem('sxb-api-token',JSON.stringify({type:'string',data:token}));localStorage.setItem('sxb-current-exam',JSON.stringify({type:'object',data:{id:exam,name:'初级社会工作师'}}))},{token:f.student,exam:f.exam})
 await context.route('**/api/**',async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();await route.fulfill({response:await route.fetch({url:f.origin+u.pathname+u.search})})})
 const page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:'+server.address().port+'/#/pages/knowledge/index')
 const nav=page.getByRole('navigation',{name:'主导航'})
 await expect(nav.getByRole('button')).toHaveCount(5)
 assert.equal((await nav.innerText()).trim(),'','No visible menu labels')
 await mkdir('.local/qa/navigation',{recursive:true})
 for(const [label,key] of [['首页','home'],['知识图谱','knowledge'],['精讲课','courses'],['刷题','practice'],['我的','profile']]){
  await nav.getByRole('button',{name:label,exact:true}).click()
  await expect(nav.locator('[aria-current="page"]')).toHaveAttribute('aria-label',label)
  await expect(nav.locator('.active .tab-svg img')).toHaveAttribute('src','/static/navigation/'+key+'-active.svg')
 }
 for(const [width,height] of [[320,667],[375,812],[430,932],[812,375]]){
  await page.setViewportSize({width,height})
  const box=await nav.boundingBox()
  assert.ok(box.x>=0 && box.x+box.width<=width && box.y+box.height<=height,'Navigation fits viewport')
  assert.ok(await nav.getByRole('button').evaluateAll(els=>els.every(el=>{const r=el.getBoundingClientRect();return r.width>=44 && r.height>=44})),'44px tap targets')
  assert.ok(await nav.locator('img').evaluateAll(els=>els.length===5 && els.every(el=>el.complete&&el.naturalWidth>0)),'All SVGs loaded')
  assert.equal(await nav.locator('.active .tab-icon').evaluate(el=>getComputedStyle(el).animationName),'none','Reduced motion respected')
  await page.screenshot({path:'.local/qa/navigation/menu-'+width+'.png',fullPage:true})
 }
 await page.emulateMedia({reducedMotion:'no-preference'})
 await nav.getByRole('button',{name:'知识图谱',exact:true}).focus()
 await page.keyboard.press('Enter')
 await expect(nav.locator('[aria-current="page"]')).toHaveAttribute('aria-label','知识图谱')
 assert.notEqual(await nav.locator('.active .tab-icon').evaluate(el=>getComputedStyle(el).animationName),'none','Selected icon animation enabled')
 assert.deepEqual(errors,[])
 console.log('PASS: five routes, SVG loading, no visible labels, selection, keyboard, responsive bounds, touch targets, reduced motion')
} finally {await browser?.close();await new Promise(r=>server.close(r));await f.close()}

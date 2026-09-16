import assert from 'node:assert/strict'
import {readFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {chromium,expect} from '@playwright/test'
import {profileFixture} from './helpers/user-profile-fixture.ts'
import {captchaVariants} from '../apps/shared/captcha.ts'
const f=await profileFixture(),service='http://127.0.0.1:4311'
const config=JSON.parse(await readFile('.local/go-captcha/sxb-config.json','utf8'))
async function solve(page,puzzle){
 const row=(await f.db.query('SELECT upstream_key FROM verification_challenges WHERE id=$1',[puzzle.challengeId])).rows[0]
 const response=await fetch(service+'/api/v1/manage/get-status-info?captchaKey='+encodeURIComponent(row.upstream_key),{headers:{'X-API-Key':config.api_keys[0]}})
 assert.equal(response.status,200)
 const answer=(await response.json()).data.data,root=page.locator('.verification-widget'),body=await root.locator('.gc-body').boundingBox(),scale=body.width/(puzzle.type==='rotate'?puzzle.size:puzzle.width)
 if(puzzle.type==='click'){for(const point of Object.values(answer))await page.mouse.click(body.x+(point.x+point.width/2)*scale,body.y+(point.y+point.height/2)*scale);await root.getByText('确认',{exact:true}).click();return}
 let from,dx,dy=0
 if(puzzle.type==='drag'){const tile=await root.locator('.gc-tile').boundingBox();from={x:tile.x+tile.width/2,y:tile.y+tile.height/2};dx=body.x+answer.x*scale-tile.x;dy=body.y+answer.y*scale-tile.y}
 else{const block=await root.locator('.gc-drag-block').boundingBox(),bar=await root.locator('.gc-drag-slide-bar').boundingBox();from={x:block.x+block.width/2,y:block.y+block.height/2};if(puzzle.type==='rotate')dx=(360-answer.angle)/360*(bar.width-block.width);else{const tile=await root.locator('.gc-tile').boundingBox(),start=tile.x-body.x,ratio=(body.width-tile.width-start)/(bar.width-block.width);dx=(answer.x*scale-start)/ratio}}
 await page.mouse.move(from.x,from.y);await page.mouse.down();await page.waitForTimeout(150);await page.mouse.move(from.x+dx,from.y+dy,{steps:25});await page.mouse.up()
}
let browser
try{
 await f.db.query("UPDATE site_preferences SET published=jsonb_set(published,'{logo}','\"/test-logo.svg\"'),draft=jsonb_set(draft,'{logo}','\"/not-published.svg\"') WHERE key='basic'")
 browser=await chromium.launch({channel:'chrome',headless:true})
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
 await context.route('**/test-logo.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#254cbd"/></svg>'}))
 await context.route('**/api/**',async route=>{const u=new URL(route.request().url());await route.fulfill({response:await route.fetch({url:f.origin+u.pathname+u.search})})})
 const page=await context.newPage(),errors=[];let logins=0
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('/auth/admin'))logins++})
 page.on('response',async r=>{if(r.url().endsWith('/verification/check')&&r.status()!==200)console.log('Verification response:',r.status(),(await r.json()).message)})
 await mkdir('.local/qa/admin-login-verification',{recursive:true})
 await page.goto('http://127.0.0.1:5180/')
 const logo=page.locator('.login-brand-logo');await expect(logo).toBeVisible();assert.equal(await logo.getAttribute('src'),'/test-logo.svg');const dimensions=await logo.boundingBox();assert.equal(dimensions.width,38);assert.equal(dimensions.height,38)
 const phone=page.getByPlaceholder('请输入手机号'),password=page.getByPlaceholder('请输入密码')
 await phone.fill(process.env.ADMIN_PHONE);await password.fill(process.env.ADMIN_PASSWORD)
 async function open(){const response=page.waitForResponse(r=>r.url().endsWith('/verification/challenge'));await page.getByRole('button',{name:'登录',exact:true}).click();const puzzle=await(await response).json();await expect(page.locator('.verification-widget .gc-picture')).toBeVisible();return puzzle}
 await open();assert.equal(logins,0);await page.getByRole('button',{name:'取消登录',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();assert.equal(logins,0);await expect(password).toHaveValue(process.env.ADMIN_PASSWORD)
 // Wrong password consumes the successful proof; retry opens a new challenge and preserves input.
 await password.fill('wrong-password');const wrong=await open();await solve(page,wrong);await expect(page.locator('.form-error')).toContainText('手机号或密码不正确');await expect(password).toHaveValue('wrong-password');await password.fill(process.env.ADMIN_PASSWORD)
 for(const [i,variant] of captchaVariants.entries()){
  console.log('Checking '+variant.id)
  await f.db.query("UPDATE integration_settings SET config=config||$1::jsonb WHERE key='captcha'",[JSON.stringify({variant:variant.id,mode:'frontend',sms:false,appearance:i%2?'dark':'light',title:variant.title,color:'#6949df'})])
  await page.setViewportSize({width:i%2?375:1440,height:i%2?812:1000})
  const prior=logins,puzzle=await open();assert.equal(puzzle.variant,variant.id);assert.equal(logins,prior)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  if(i<2)await page.screenshot({path:'.local/qa/admin-login-verification/'+variant.id+'.png',fullPage:true})
  const auth=page.waitForResponse(r=>r.url().endsWith('/auth/admin'));await solve(page,puzzle);assert.equal((await auth).status(),200);await expect(page.locator('.admin-shell')).toBeVisible();assert.equal(logins,prior+1)
  // Clear the isolated fixture session without consuming the login limiter's budget with logouts.
  const token=await page.evaluate(()=>sessionStorage.getItem('sxb-admin-token'));await f.db.query('DELETE FROM sessions WHERE token_hash=$1',[createHash('sha256').update(token).digest('hex')])
  await page.evaluate(()=>sessionStorage.removeItem('sxb-admin-token'));await page.reload();await phone.fill(process.env.ADMIN_PHONE);await password.fill(process.env.ADMIN_PASSWORD)
 }
 await page.route('**/api/verification/challenge',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'验证码服务暂时不可用'})}),{times:1})
 const prior=logins;await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('验证码服务暂时不可用');assert.equal(logins,prior);await page.getByRole('button',{name:'取消登录',exact:true}).click()
 await context.route('**/test-logo.svg',r=>r.fulfill({status:404}));await page.reload();await expect(page.locator('.login-header .brand-icon')).toBeVisible();await expect(page.locator('.login-brand-logo')).toHaveCount(0)
 assert.deepEqual(errors,[])
 console.log('PASS: published logo 38x38, fallback, cancel, password retry, all 8 captcha variants, no bypass, responsive dialog and no browser errors')
}finally{await browser?.close();await f.close()}

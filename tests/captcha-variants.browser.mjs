import assert from 'node:assert/strict'
import {readFile,mkdir} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'
import {profileFixture} from './helpers/user-profile-fixture.ts'
import {captchaVariants,captchaColors} from '../apps/shared/captcha.ts'

const f=await profileFixture(),service='http://127.0.0.1:4311',config=JSON.parse(await readFile('.local/go-captcha/sxb-config.json','utf8'));let browser
async function solution(challengeId){const row=(await f.db.query('SELECT upstream_key FROM verification_challenges WHERE id=$1',[challengeId])).rows[0];const r=await fetch(service+'/api/v1/manage/get-status-info?captchaKey='+encodeURIComponent(row.upstream_key),{headers:{'X-API-Key':config.api_keys[0]}});assert.equal(r.status,200);return (await r.json()).data.data}
async function solve(page,root,puzzle){
 const answer=await solution(puzzle.challengeId),body=await root.locator('.gc-body').boundingBox(),scale=body.width/(puzzle.type==='rotate'?puzzle.size:puzzle.width)
 if(puzzle.type==='click'){
  for(const p of Object.values(answer))await page.mouse.click(body.x+(p.x+p.width/2)*scale,body.y+(p.y+p.height/2)*scale)
  await root.getByText('确认',{exact:true}).click();return
 }
 let from,dx,dy=0
 if(puzzle.type==='drag'){const tile=await root.locator('.gc-tile').boundingBox();from={x:tile.x+tile.width/2,y:tile.y+tile.height/2};dx=body.x+answer.x*scale-tile.x;dy=body.y+answer.y*scale-tile.y}
 else {const block=await root.locator('.gc-drag-block').boundingBox(),bar=await root.locator('.gc-drag-slide-bar').boundingBox();from={x:block.x+block.width/2,y:block.y+block.height/2};if(puzzle.type==='rotate')dx=(360-answer.angle)/360*(bar.width-block.width);else{const tile=await root.locator('.gc-tile').boundingBox(),start=tile.x-body.x,ratio=(body.width-tile.width-start)/(bar.width-block.width);dx=(answer.x*scale-start)/ratio}}
 await page.mouse.move(from.x,from.y);await page.mouse.down();await page.waitForTimeout(150);await page.mouse.move(from.x+dx,from.y+dy,{steps:25});await page.mouse.up()
}
try{
 await f.db.query("UPDATE integration_settings SET config=jsonb_set(jsonb_set(config,'{sms}','true'),'{mode}','\"gocaptcha\"') WHERE key='captcha'")
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1600,height:1080},reducedMotion:'reduce'}),errors=[]
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));await context.route('**/api/**',async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();await route.fulfill({response:await route.fetch({url:f.origin+u.pathname+u.search})})});await context.addInitScript(t=>{if(location.port==='5180')sessionStorage.setItem('sxb-admin-token',t)},f.token)
 const admin=await context.newPage();await admin.goto('http://127.0.0.1:5180/#settings');await admin.getByRole('tab',{name:'接口配置',exact:true}).click();await admin.getByRole('button',{name:'配置验证码',exact:true}).click();await expect(admin.locator('.captcha-choice')).toHaveCount(8)
 await mkdir('.local/qa/captcha-variants',{recursive:true})
 for(const [i,v] of captchaVariants.entries()){
  await admin.locator('.captcha-choice').filter({hasText:v.label}).first().click()
  // Exact label for default Chinese/English avoids selecting their dark variants.
  assert.equal(await admin.locator('.captcha-choice[aria-pressed=true]>span').innerText(),v.label)
  await admin.locator('.captcha-colors button').filter({hasText:captchaColors[i%captchaColors.length].label}).click();await admin.locator('.el-radio-button').filter({hasText:i%2?'深色':'浅色'}).click()
  const response=admin.waitForResponse(r=>r.url().endsWith('/admin/integrations/captcha/preview'));await admin.getByRole('button',{name:'加载预览',exact:true}).click();const puzzle=await(await response).json();assert.equal(puzzle.variant,v.id);await expect(admin.locator('.captcha-preview .gc-picture')).toBeVisible()
  if(i===0||i===4||i===2)await admin.screenshot({path:'.local/qa/captcha-variants/admin-'+v.id+'.png',fullPage:true})
  await solve(admin,admin.locator('.captcha-preview'),puzzle);await expect(admin.getByText('验证通过',{exact:true})).toBeVisible()
  const save=admin.getByRole('button',{name:'保存配置',exact:true});if(await save.isEnabled()){await save.click();await expect(save).toBeDisabled()}
  const user=await context.newPage();await user.setViewportSize({width:i%2?320:375,height:812});await user.goto('http://127.0.0.1:5174/#/pages/login/index');await expect(user.locator('.login-tip')).toContainText('本地测试');await user.locator('.field input').first().fill('1880000'+String(1000+i));const next=user.waitForResponse(r=>r.url().endsWith('/verification/challenge'));await user.locator('.code-button').click();const challenge=await(await next).json();assert.equal(challenge.variant,v.id);assert.equal(challenge.appearance,i%2?'dark':'light');const gate=user.locator('.verify-card');await expect(gate.locator('.gc-picture')).toBeVisible()
  assert.equal(await user.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await user.screenshot({path:'.local/qa/captcha-variants/user-'+v.id+'.png'})
  const sent=user.waitForResponse(r=>r.url().endsWith('/auth/code'));await solve(user,gate,challenge);assert.equal((await(await sent).json()).isTest,true);await expect(gate).toBeHidden();await user.close()
  console.log('PASS '+v.id+' admin preview and student verification')
 }
 assert.deepEqual(errors,[])
}finally{await browser?.close();await f.close()}

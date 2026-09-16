import assert from 'node:assert/strict'
import {mkdir,readFile} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'
import {profileFixture} from './helpers/user-profile-fixture.ts'

// This test needs the private local GoCaptcha service. The management key never goes to a browser.
const config=JSON.parse(await readFile('.local/go-captcha/sxb-config.json','utf8'))
const service=process.env.GOCAPTCHA_URL||'http://127.0.0.1:4311'
const f=await profileFixture();let browser
async function solution(challengeId){const row=(await f.db.query('SELECT upstream_key FROM verification_challenges WHERE id=$1',[challengeId])).rows[0];const r=await fetch(service+'/api/v1/manage/get-status-info?captchaKey='+encodeURIComponent(row.upstream_key),{headers:{'X-API-Key':config.api_keys[0]}});assert.equal(r.status,200);return (await r.json()).data.data}
async function slide(page,root,x){const image=await root.locator('.gc-body').boundingBox(),tile=await root.locator('.gc-tile').boundingBox(),block=await root.locator('.gc-drag-block').boundingBox();const start=tile.x-image.x,ratio=(image.width-tile.width-start)/(image.width-block.width),dx=(x*image.width/300-start)/ratio;await page.mouse.move(block.x+block.width/2,block.y+block.height/2);await page.mouse.down();await page.waitForTimeout(180);await page.mouse.move(block.x+block.width/2+dx,block.y+block.height/2,{steps:20});await page.mouse.up()}
try{
 await f.db.query("UPDATE integration_settings SET config=jsonb_set(config,'{color}','\"#159b81\"') WHERE key='captcha'")
 browser=await chromium.launch({channel:'chrome',headless:true})
 const context=await browser.newContext({viewport:{width:1600,height:1080},reducedMotion:'reduce'}),errors=[]
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)))
 await context.route('**/api/**',async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();await route.fulfill({response:await route.fetch({url:f.origin+u.pathname+u.search})})})
 await context.addInitScript(t=>{if(location.port==='5180')sessionStorage.setItem('sxb-admin-token',t)},f.token)
 const page=await context.newPage();await page.goto('http://127.0.0.1:5180/#settings');await page.getByRole('tab',{name:'接口配置',exact:true}).click();await page.getByRole('button',{name:'配置验证码',exact:true}).click()
 await page.locator('.el-radio-button').filter({hasText:'GoCaptcha'}).click();await page.getByText('发送登录短信前',{exact:true}).click();await page.getByLabel('提示文字',{exact:true}).fill('拖动完成安全验证')
 const response=page.waitForResponse(r=>r.url().includes('/admin/integrations/captcha/preview'));await page.getByRole('button',{name:'加载预览',exact:true}).click();const challenge=await(await response).json();await expect(page.locator('.captcha-preview .gc-picture')).toBeVisible();await expect(page.locator('.captcha-preview .gc-drag-block')).toHaveCSS('background-color','rgb(21, 155, 129)')
 await mkdir('.local/qa/integrations',{recursive:true});await page.screenshot({path:'.local/qa/integrations/admin-captcha.png'})
 await slide(page,page.locator('.captcha-preview'),(await solution(challenge.challengeId)).x);await expect(page.getByText('验证通过',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'保存配置',exact:true}).click();await expect(page.getByRole('button',{name:'保存配置',exact:true})).toBeDisabled()
 await page.getByRole('button',{name:'全部接口',exact:true}).click();await page.getByRole('button',{name:'配置短信',exact:true}).click();await expect(page.getByLabel('AccessKey Secret')).toHaveValue('');await page.screenshot({path:'.local/qa/integrations/admin-sms.png'})
 const user=await context.newPage();await user.setViewportSize({width:375,height:812});await user.goto('http://127.0.0.1:5174/#/pages/login/index');await user.locator('.field input').first().fill('18800006666')
 const next=user.waitForResponse(r=>r.url().endsWith('/verification/challenge'));await user.locator('.code-button').click();let puzzle=await(await next).json();const gate=user.locator('.verify-card');await expect(gate.locator('.gc-picture')).toBeVisible();await user.screenshot({path:'.local/qa/integrations/user-captcha.png'})
 assert.equal(await user.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await expect(gate.locator('.gc-drag-block')).toHaveCSS('background-color','rgb(21, 155, 129)')
 const refreshed=user.waitForResponse(r=>r.url().endsWith('/verification/challenge'));await slide(user,gate,50);puzzle=await(await refreshed).json();await expect(gate.locator('.verify-error')).toContainText('不正确')
 const codeResponse=user.waitForResponse(r=>r.url().endsWith('/auth/code'));await slide(user,gate,(await solution(puzzle.challengeId)).x);const code=await(await codeResponse).json();assert.match(code.testCode,/^\d{4}$/);await expect(gate).toBeHidden();await expect(user.locator('.login-tip')).toContainText(code.testCode)
 const mobileContext=await browser.newContext({viewport:{width:320,height:740},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'})
 await mobileContext.route('**/api/**',async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();await route.fulfill({response:await route.fetch({url:f.origin+u.pathname+u.search})})})
 const mobile=await mobileContext.newPage();mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto('http://127.0.0.1:5174/#/pages/login/index');await mobile.locator('.field input').first().fill('18800007777');const mobileNext=mobile.waitForResponse(r=>r.url().endsWith('/verification/challenge'));await mobile.locator('.code-button').tap();const mobilePuzzle=await(await mobileNext).json(),mobileGate=mobile.locator('.verify-card');await expect(mobileGate.locator('.gc-picture')).toBeVisible();const target=(await solution(mobilePuzzle.challengeId)).x,body=await mobileGate.locator('.gc-body').boundingBox(),tile=await mobileGate.locator('.gc-tile').boundingBox(),block=await mobileGate.locator('.gc-drag-block').boundingBox(),start=tile.x-body.x,ratio=(body.width-tile.width-start)/(body.width-block.width),dx=(target*body.width/300-start)/ratio
 const cdp=await mobileContext.newCDPSession(mobile),x=block.x+block.width/2,y=block.y+block.height/2;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await mobile.waitForTimeout(180);for(let i=1;i<=20;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/20,y}]});const touchCode=mobile.waitForResponse(r=>r.url().endsWith('/auth/code'));await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal((await(await touchCode).json()).isTest,true);await expect(mobileGate).toBeHidden();assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 assert.deepEqual(errors,[])
 console.log('PASS: actual GoCaptcha admin preview, save, H5 slider retry and SMS test flow; no real SMS sent')
}finally{await browser?.close();await f.close()}

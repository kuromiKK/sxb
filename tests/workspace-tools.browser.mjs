import {chromium,expect} from '@playwright/test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {profileFixture} from './helpers/user-profile-fixture.ts'
const f=await profileFixture(),browser=await chromium.launch({channel:'chrome',headless:true}),errors=[]
try{
 const {agentRequestSchema}=await import('../apps/api/src/workspace-tools.ts')
 const {discoverFeatureModels}=await import('../apps/api/src/ai.ts')
 await mkdir('.local/qa/workspace-tools',{recursive:true})
 const context=await browser.newContext({viewport:{width:1700,height:1100},reducedMotion:'reduce'})
 await context.addInitScript(token=>sessionStorage.setItem('sxb-admin-token',token),f.token)
 let modelStep=0,mode='fill',calls=[]
 await context.route('**/api/**',async route=>{
  const req=route.request(),u=new URL(req.url())
  if(u.pathname.startsWith('/api/admin/ai/')&&u.pathname.endsWith('/models')){
   try{const data=await discoverFeatureModels(f.admin.id,u.pathname.split('/').at(-2),req.postDataJSON(),async(_url,secret)=>{if(secret==='fixture-denied')throw Object.assign(new Error('denied'),{upstreamStatus:401});return {data:[{id:'qwen3.5-plus'},{id:'other-model'}]}});return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})}
   catch(e){return route.fulfill({status:e.status||500,contentType:'application/json',body:JSON.stringify({message:e.message})})}
  }
  if(u.pathname.endsWith('/page-agent/chat/completions')){
   const body=req.postDataJSON();agentRequestSchema.parse(body);calls.push(body)
   const content=body.messages.filter(x=>x.role==='user').at(-1).content
   assert.ok(!content.includes('Page Agent · 中文工作助手'),'assistant UI excluded from model input')
   let action
   if(modelStep===0||mode==='stop'){
    const line=content.split('\n').find(l=>l.includes('新增文章')&&/\[\d+\]/.test(l));assert.ok(line,'new article button indexed: '+content.slice(-4000));action={click_element_by_index:{index:Number(line.match(/\[(\d+)\]/)[1])}}
   }else if(modelStep===1){
    const line=content.split('\n').find(l=>/aria-label=['"]?文章标题(?:['"\s>])/.test(l)&&l.includes('<input')&&/\[\d+\]/.test(l));assert.ok(line,'article title field indexed: '+content.slice(-4000));action={input_text:{index:Number(line.match(/\[(\d+)\]/)[1]),text:'Page Agent 自动填写验证'}}
   }else if(modelStep===2)action={ask_user:{question:'请确认文章是否暂存为草稿？'}}
   else action={done:{success:true,text:'已填写文章标题，尚未保存，请检查。'}}
   modelStep++
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'fixture',choices:[{index:0,finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:'call_'+modelStep,type:'function',function:{name:body.tools[0].function.name,arguments:JSON.stringify({next_goal:'验证后台表单操作',action})}}]}}],usage:{prompt_tokens:100,completion_tokens:30,total_tokens:130}})})
  }
  if(u.pathname.endsWith('/page-agent/test'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'success',mode:'live',message:'模型连接成功，工具调用测试通过',durationMs:30,testedAt:new Date().toISOString()})})
  await route.fulfill({response:await route.fetch({url:f.origin+u.pathname+u.search})})
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:5180/#settings')
 await page.getByRole('tab',{name:'接口配置',exact:true}).click();await expect(page.locator('.interface-card')).toHaveCount(8)
 await page.screenshot({path:'.local/qa/workspace-tools/cards.png',fullPage:true})
 await page.getByRole('button',{name:'配置G6 图谱',exact:true}).click()
 await expect(page.locator('.graph-live-preview .kr-node-root')).toBeVisible();await expect(page.locator('.graph-live-preview .kr-canvas')).toHaveAttribute('aria-busy','false')
 await page.getByRole('button',{name:'清新自然',exact:true}).click()
 await expect(page.locator('.graph-live-preview .knowledge-relation')).toHaveAttribute('data-node-style','soft')
 assert.equal(await page.locator('.graph-live-preview .kr-node-card').first().evaluate(el=>getComputedStyle(el).borderRadius),'13px')
 await page.getByLabel('卡片圆角（px）',{exact:true}).fill('20')
 await page.getByLabel('画布高度（px）',{exact:true}).fill('850')
 await page.getByRole('button',{name:'保存配置',exact:true}).click();await expect(page.getByRole('button',{name:'保存配置',exact:true})).toBeDisabled()
 await page.getByText('思维导图',{exact:true}).last().click();await expect(page.locator('.graph-live-preview .mm-root')).toBeVisible()
 await page.screenshot({path:'.local/qa/workspace-tools/g6.png',fullPage:true})
 await page.goto('http://127.0.0.1:5180/#knowledge-graph');await page.locator('.grid button').filter({hasText:'初级社会工作师'}).click()
 await page.getByRole('tab',{name:'关系图谱',exact:true}).click();await expect(page.locator('.kr-canvas')).toHaveAttribute('aria-busy','false');await expect(page.locator('.knowledge-relation')).toHaveAttribute('data-node-style','soft')
 assert.equal(await page.locator('.kr-node-card').first().evaluate(el=>getComputedStyle(el).borderRadius),'20px');assert.equal(Math.round((await page.locator('.kr-canvas').boundingBox()).height),850)
 await page.getByRole('tab',{name:'思维导图',exact:true}).click();await expect(page.locator('.mm-root')).toBeVisible();await expect(page.locator('.kr-canvas')).toHaveAttribute('aria-busy','false');assert.equal(await page.locator('.mm-node').first().evaluate(el=>getComputedStyle(el).borderRadius),'20px')
 await page.goto('http://127.0.0.1:5180/#settings');await page.getByRole('tab',{name:'接口配置',exact:true}).click();await page.getByRole('button',{name:'配置AI员工',exact:true}).click()
 await expect(page.getByRole('tab',{name:'AI员工',exact:true})).toHaveCount(0)
 const appearance=page.getByRole('region',{name:'AI员工外观预览'})
 await page.emulateMedia({colorScheme:'dark'});await expect(appearance).toHaveAttribute('data-theme','dark')
 await page.emulateMedia({colorScheme:'light'});await expect(appearance).toHaveAttribute('data-theme','light')
 await page.locator('.el-radio-button').filter({has:page.getByRole('radio',{name:'深色',exact:true})}).click()
 await page.getByRole('textbox',{name:'AI员工主色',exact:true}).fill('#7c3aed');await page.getByRole('textbox',{name:'深色面板背景',exact:true}).fill('#202438')
 assert.equal(await appearance.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(32, 36, 56)')
 assert.equal(await appearance.evaluate(el=>getComputedStyle(el).getPropertyValue('--el-color-primary').trim()),'#7c3aed')
 await page.getByRole('button',{name:'确认示例',exact:true}).click();await expect(appearance).toContainText('没有修改任何业务内容');assert.equal(calls.length,0)
 await expect(page.getByLabel('API Key',{exact:true})).toHaveCount(0)
 await page.locator('.el-switch').filter({has:page.getByRole('switch',{name:'启用 Page Agent',exact:true})}).click();await page.getByRole('button',{name:'保存配置',exact:true}).click();await expect(page.getByRole('button',{name:'保存配置',exact:true})).toBeDisabled()
 await page.getByRole('button',{name:'配置服务与模型',exact:true}).click();await expect(page).toHaveURL(/#ai$/)
 const aiRow=page.locator('.el-table__row').filter({has:page.getByRole('button',{name:'AI员工',exact:true})})
 await expect(aiRow).toBeVisible();await aiRow.getByRole('button',{name:'配置',exact:true}).click()
 const drawer=page.locator('.el-drawer:visible'),readModels=drawer.getByRole('button',{name:'测试并获取模型',exact:true}),key=drawer.getByRole('textbox',{name:'API Key',exact:true}),model=drawer.getByRole('combobox',{name:'模型 ID',exact:true})
 await expect(readModels).toBeDisabled();await expect(model).toBeDisabled()
 await key.fill('fixture-denied');await readModels.click();await expect(drawer.locator('.ai-discovery-result')).toContainText('验证未通过');await expect(model).toBeDisabled()
 await key.fill('fixture-secret');await readModels.click();await expect(drawer.locator('.ai-discovery-result')).toContainText('已读取 2 个模型')
 await model.click();await page.getByRole('option',{name:'qwen3.5-plus',exact:true}).click()
 await key.fill('fixture-secret-edited');await expect(model).toBeDisabled();await key.fill('fixture-secret');await readModels.click();await expect(drawer.locator('.ai-discovery-result')).toContainText('已读取 2 个模型');await model.click();await page.getByRole('option',{name:'qwen3.5-plus',exact:true}).click()
 const keyPosition=await key.boundingBox(),buttonPosition=await readModels.boundingBox(),modelPosition=await model.boundingBox();assert.ok(buttonPosition.x>keyPosition.x);assert.ok(Math.abs(buttonPosition.y-keyPosition.y)<5);assert.ok(modelPosition.y>keyPosition.y)
 await drawer.locator('.el-switch').click()
 await drawer.screenshot({path:'.local/qa/workspace-tools/ai-connection.png'})
 await page.setViewportSize({width:900,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.setViewportSize({width:1700,height:1100})
 await drawer.getByRole('button',{name:'保存配置',exact:true}).click();await expect(drawer).toHaveCount(0)
 await aiRow.getByRole('button',{name:'配置',exact:true}).click();await expect(key).toHaveValue('');await expect(key).toHaveAttribute('placeholder',/已加密保存/);await drawer.getByRole('button',{name:'取消',exact:true}).click()
 await aiRow.getByRole('button',{name:'测试连接',exact:true}).click();await page.getByRole('button',{name:'发送测试',exact:true}).click();await expect(aiRow).toContainText('最近测试成功')
 // Other AI features share the same discovery component and server endpoint.
 const chatRow=page.locator('.el-table__row').filter({has:page.getByRole('button',{name:'知识点答疑',exact:true})})
 await chatRow.getByRole('button',{name:'配置',exact:true}).click();await key.fill('fixture-secret');await readModels.click();await expect(drawer.locator('.ai-discovery-result')).toContainText('已读取 2 个模型');await drawer.getByRole('button',{name:'取消',exact:true}).click()
 await page.goto('http://127.0.0.1:5180/#articles');await page.getByRole('button',{name:'AI员工',exact:true}).click();await page.getByRole('textbox',{name:'交代 AI员工任务'}).fill('新增文章并填写标题，不保存。')
 await expect(page.locator('.agent-panel')).toHaveAttribute('data-theme','dark');assert.equal(await page.locator('.agent-panel').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(32, 36, 56)');assert.equal(await page.locator('.agent-panel').evaluate(el=>getComputedStyle(el).getPropertyValue('--el-color-primary').trim()),'#7c3aed')
 await page.getByRole('button',{name:'开始任务',exact:true}).click();await expect(page.locator('.agent-confirm')).toBeVisible({timeout:20000});await page.getByRole('button',{name:'确认执行',exact:true}).click()
 await expect(page.locator('.el-drawer:visible')).toBeVisible();await expect(page.locator('.agent-confirm')).toContainText('Page Agent 自动填写验证');await page.getByRole('button',{name:'确认执行',exact:true}).click()
 const reply=page.getByRole('textbox',{name:'回答 AI员工',exact:true});await expect(reply).toBeVisible({timeout:15000});await reply.click();await expect(reply).toBeFocused();await reply.pressSequentially('Keep as draft',{delay:30});await expect(reply).toHaveValue('Keep as draft');await page.getByRole('button',{name:'发送回答',exact:true}).click()
 await expect(page.locator('.agent-answer')).toContainText('尚未保存',{timeout:15000});await expect(page.getByRole('textbox',{name:'文章标题',exact:true})).toHaveValue('Page Agent 自动填写验证');assert.equal(calls.length,4)
 await page.screenshot({path:'.local/qa/workspace-tools/agent-action.png',fullPage:true})
 await page.locator('.el-drawer:visible').getByRole('button',{name:'取消',exact:true}).click();mode='stop'
 await page.getByRole('button',{name:'开始任务',exact:true}).click();await expect(page.locator('.agent-confirm')).toBeVisible();await page.getByRole('button',{name:'停止任务',exact:true}).click();await expect(page.locator('.agent-progress')).toContainText('已停止');await expect(page.locator('.el-drawer:visible')).toHaveCount(0)
 await page.goto('http://127.0.0.1:5180/#settings');await expect(page.getByRole('button',{name:'开始任务',exact:true})).toBeDisabled();await expect(page.locator('.agent-panel')).toContainText('当前页面未开放')
 assert.equal(errors.length,0,errors.join('\n'));console.log('PASS settings persistence, G6 live previews and both actual graphs, masked credentials, native Page Agent tool loop, DOM filling, confirmations, cancellation and page boundaries (model responses simulated).')
}finally{await browser.close();await f.close()}

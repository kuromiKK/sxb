import 'dotenv/config'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'

const browser=await chromium.launch({channel:'chrome',headless:true})
const output='.local/qa/knowledge-relation'
await mkdir(output,{recursive:true})
try{
  const page=await browser.newPage({viewport:{width:1733,height:1272},reducedMotion:process.env.GRAPH_TEST_MOTION==='on'?'no-preference':'reduce'})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://127.0.0.1:5180/#knowledge-graph')
  await page.getByPlaceholder('请输入手机号').fill(process.env.ADMIN_PHONE)
  await page.getByPlaceholder('请输入密码').fill(process.env.ADMIN_PASSWORD)
  await page.getByRole('button',{name:'登录',exact:true}).click()
  const response=page.waitForResponse(r=>r.url().includes('/admin/knowledge-structure/'))
  await page.locator('.grid button').filter({hasText:'初级社会工作师'}).click()
  const data=await(await response).json()
  await page.getByRole('tab',{name:'关系图谱',exact:true}).click()
  const panel=page.locator('.knowledge-relation'),canvas=panel.locator('.kr-canvas')
  const ready=async()=>{await expect(canvas).toHaveAttribute('aria-busy','false');await expect(panel.locator('.kr-node-root')).toHaveCount(1)}
  await ready()
  await expect(panel.locator('.kr-node-card')).toHaveCount(data.subjects.length)
  assert((await canvas.boundingBox()).height>=700)
  async function checkLayout(){
    await expect(async()=>{
    const boxes=await panel.locator('.kr-node').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}}))
    const area=await canvas.boundingBox()
    for(const box of boxes){assert(box.x>=area.x-2&&box.y>=area.y-2,JSON.stringify({box,area}));assert(box.x+box.w<=area.x+area.width+2&&box.y+box.h<=area.y+area.height+2,JSON.stringify({box,area}))}
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,'Nodes overlap')}
    }).toPass({timeout:5000})
  }
  await checkLayout()
  await page.screenshot({path:output+'/exam.png',fullPage:true})
  const subject=data.subjects[0]
  await panel.getByRole('button',{name:'科目：'+subject.title,exact:true}).click()
  await expect(panel.locator('.kr-node-root .kr-node-title')).toHaveText([subject.title])
  await ready();await checkLayout()
  assert(subject.chapters.length>8,'Fixture should exercise pagination')
  await expect(panel.locator('.kr-node-card')).toHaveCount(8)
  await page.screenshot({path:output+'/subject.png',fullPage:true})
  await panel.locator('.btn-next').click()
  await ready();await checkLayout()
  const search=panel.getByRole('textbox',{name:'搜索当前层名称'})
  const chapter=subject.chapters[0]
  await search.fill(chapter.title)
  await expect(panel.getByRole('button',{name:'章：'+chapter.title,exact:true})).toBeVisible()
  await panel.getByRole('button',{name:'章：'+chapter.title,exact:true}).click()
  await expect(panel.locator('.kr-node-root .kr-node-title')).toHaveText([chapter.title])
  await ready();await checkLayout()
  await page.screenshot({path:output+'/chapter.png',fullPage:true})
  const section=chapter.sections.find(s=>s.knowledge.length)
  await search.fill(section.title)
  await panel.getByRole('button',{name:'节：'+section.title,exact:true}).click()
  await expect(panel.locator('.kr-node-root .kr-node-title')).toHaveText([section.title])
  await ready();await checkLayout()
  if(section.courses.length){
    const course=section.courses[0]
    await search.fill(course.title)
    await expect(panel.locator('.kr-node-card')).toHaveCount([...section.courses,...section.knowledge].filter(n=>n.title.includes(course.title)).length);await ready()
    await panel.getByRole('button',{name:'全屏画布',exact:true}).click()
    await expect(panel).toHaveClass(/is-fullscreen/);await ready()
    await panel.getByRole('button',{name:'课程：'+course.title,exact:true}).click()
    await expect(panel).not.toHaveClass(/is-fullscreen/)
    await expect(page.locator('.el-drawer:visible')).toBeVisible()
    await page.locator('.el-drawer:visible').getByRole('button',{name:'取消',exact:true}).click()
    await search.fill('');await ready()
  }
  await page.screenshot({path:output+'/section.png',fullPage:true})
  const knowledge=section.knowledge[0]
  await search.fill(knowledge.title)
  await expect(panel.locator('.kr-node-card')).toHaveCount(1);await ready()
  const point=panel.getByRole('button',{name:'知识点：'+knowledge.title,exact:true})
  await point.focus();await expect(point.locator('.kr-node-tooltip')).toBeVisible()
  await point.press('Enter')
  await expect(page.locator('.el-drawer:visible')).toBeVisible()
  await page.locator('.el-drawer:visible').getByRole('button',{name:'取消',exact:true}).click()
  await search.fill('没有此节点__')
  await expect(panel.locator('.kr-empty')).toContainText('没有匹配')
  await search.fill('');await ready()
  await panel.getByRole('button',{name:'返回上一级',exact:true}).click()
  await expect(panel.locator('.kr-node-root .kr-node-title')).toHaveText([chapter.title])
  await panel.locator('.kr-breadcrumbs button').first().click()
  await expect(panel.locator('.kr-node-root .kr-node-title')).toHaveText(['初级社会工作师'])
  await ready()
  const initial=(await panel.locator('.kr-node-root').boundingBox()).width
  await panel.getByRole('button',{name:'放大关系图',exact:true}).click()
  await expect.poll(async()=>(await panel.locator('.kr-node-root').boundingBox()).width).toBeGreaterThan(initial)
  await panel.getByRole('button',{name:'居中适配关系图',exact:true}).click()
  await expect.poll(async()=>Math.round((await panel.locator('.kr-node-root').boundingBox()).width)).toBe(184)
  await panel.getByRole('button',{name:'全屏画布',exact:true}).click()
  await expect(panel).toHaveClass(/is-fullscreen/);await ready();await checkLayout()
  await panel.getByRole('button',{name:'退出全屏画布',exact:true}).click()
  await expect(panel).not.toHaveClass(/is-fullscreen/)
  await page.setViewportSize({width:1280,height:900});await ready();await expect(checkLayout).toPass({timeout:5000})
  await page.screenshot({path:output+'/laptop.png',fullPage:true})
  await page.getByRole('tab',{name:'列表管理',exact:true}).click()
  await expect(page.locator('.knowledge-list-manager')).toBeVisible()
  await page.getByRole('tab',{name:'关系图谱',exact:true}).click();await ready()
  await page.setViewportSize({width:390,height:844});await ready()
  assert(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth+2))
  await page.screenshot({path:output+'/mobile.png',fullPage:true})
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({status:'PASS',layout:true,search:true,pagination:true,drilldown:true,keyboardDrawer:true,fullscreen:true,zoom:true,resize:true,contentWrites:0}))
}finally{await browser.close()}

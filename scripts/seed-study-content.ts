import 'dotenv/config'
import { copyFile, stat, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { db, closeDatabase, transaction } from '../apps/api/src/db.ts'
import { migrate } from '../apps/api/src/schema.ts'
import { id } from '../apps/api/src/security.ts'

if(process.env.APP_MODE==='production')throw new Error('Test materials are disabled in production')
await migrate()
const directory=resolve(process.env.MEDIA_DIR||'.local/media')
await mkdir(directory,{recursive:true})
const owner=(await db.query("SELECT id FROM users WHERE account_kind='admin' AND role='superadmin' LIMIT 1")).rows[0]
if(!owner)throw new Error('Create the initial administrator before seeding test content')
const exam='junior-social-worker',point='study-content-demo-point',sheet='study-content-demo-sheet'
const p=(text:string)=>({type:'paragraph',content:[{type:'text',text}]})
const h=(text:string)=>({type:'heading',attrs:{level:2},content:[{type:'text',text}]})
async function asset(contentId:string,kind:string,file:string,mime:string){
  const assetId=`${contentId}-${kind}`
  if((await db.query('SELECT id FROM media_assets WHERE id=$1',[assetId])).rows.length)return assetId
  const path=resolve('.local/qa',file),disk=id(),size=(await stat(path)).size
  await copyFile(path,resolve(directory,disk))
  await db.query(`INSERT INTO media_assets(id,exam_id,content_id,owner_id,kind,source,filename,mime,size_bytes,disk_name) VALUES($1,$2,$3,$4,$5,'upload',$6,$7,$8,$9)`,[assetId,exam,contentId,owner.id,kind,`测试内容-${file}`,mime,size,disk])
  return assetId
}
try {
  const video=await asset(point,'video','study-test.mp4','video/mp4'),image=await asset(point,'image','study-test.png','image/png'),audio=await asset(point,'audio','study-test.wav','audio/wav')
  const document={type:'doc',content:[h('理解服务对象自决'),p('【测试内容】这是独立的知识点课程样例，用于验证正文编辑、免费图文阅读和会员音视频播放，不替代正式教材。'),p('服务对象在充分知情的基础上参与选择。社会工作者应说明可行方案与风险，尊重其意愿，同时评估法律、安全和伦理边界。'),h('媒体播放验证'),p('下方是三秒钟测试画面和两秒钟低音量测试音，不是教学内容。'),{type:'resource',attrs:{assetId:video,kind:'video',title:'【测试内容】视频播放验证',posterAssetId:image}},{type:'resource',attrs:{assetId:audio,kind:'audio',title:'【测试内容】音频播放验证',posterAssetId:null}}]}
  const sheetDoc={type:'doc',content:[h('考前复盘清单'),p('【测试内容】本篇仅用于验证 SVIP 阅读权限、开放时间与首页提醒，不是押题或内部考试资料。'),h('一、先查易错概念'),p('区分接纳与认同、尊重自决与放任不管。用一句话写出每个概念的适用边界，再对照笔记中的具体情境。'),h('二、回看错题理由'),p('优先回看反复错的题。先遮住答案，说明选项的判断依据，再核对解析。已经理解的题可以暂时跳过。'),h('三、保留考前节奏'),p('学习计划是提醒，不是强制任务。结合自己的可用时间安排休息，并以考试组织方正式通知为准准备证件和物品。')]}
  await transaction(async c=>{
    await c.query(`INSERT INTO content(id,exam_id,kind,parent_id,title,status,payload,source,is_test_data) VALUES($1,$2,'knowledge','ability-section-1-1','【测试内容】知识点图文与音视频示例','published',$3,'study_content_test',true) ON CONFLICT DO NOTHING`,[point,exam,JSON.stringify({stars:3,no:999,isKnowledgeCourse:true,content:'【测试内容】服务对象在充分知情的基础上参与选择。',document})])
    await c.query(`INSERT INTO content(id,exam_id,kind,title,status,payload,source,is_test_data) VALUES($1,$2,'cheatsheet','【测试内容】考前复盘清单','published',$3,'study_content_test',true) ON CONFLICT DO NOTHING`,[sheet,exam,JSON.stringify({intro:'概念辨析、错题回看与考前节奏。仅用于本机流程验证。',opensAt:new Date(Date.now()-86400000).toISOString(),closesAt:new Date(Date.now()+30*86400000).toISOString(),document:sheetDoc})])
    await c.query(`INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,'content.seed_test',$3,$4)`,[id(),owner.id,sheet,JSON.stringify({contentIds:[point,sheet],source:'local test fixtures; existing content not overwritten'})])
  })
  console.log('Test knowledge course and cheat sheet are ready. Existing records were not overwritten.')
}finally{await closeDatabase()}

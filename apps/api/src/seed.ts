import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import { randomInt } from 'node:crypto'
import { db, closeDatabase, transaction } from './db.ts'
import { migrate } from './schema.ts'
import { id, passwordHash } from './security.ts'
import { featureNames, pricePresets } from './ai.ts'
import { knowledgeSubjects, courseCatalog, practiceQuestions } from '../../user/src/mock/data.ts'
import { examNotices } from '../../user/src/utils/examNotices.ts'
import { initLearningTables } from './reports.ts'

export async function seed() {
  await migrate()
  await initLearningTables()
  const messageTemplates = [
    ['weekly-plan','每周任务提醒','{{exam_name}}本周学习安排已更新','上周完成{{last_week_questions}}道题，本周计划完成{{this_week_questions}}道题。'],
    ['order-paid','购买成功通知','{{exam_name}}{{membership_permission}}已开通','有效期至{{membership_expire_time}}，感谢你的支持。'],
    ['report-ready','学习报告生成完成','{{report_month}}学习报告已生成','本月学习{{report_study_days}}天，完成{{report_questions}}道题。'],
    ['exam-reminder','考试倒计时提醒','距离{{exam_name}}考试还有{{exam_days_left}}天','请按学习计划安排复习。'],
  ]
  for(const [tid,name,title,content] of messageTemplates) await db.query(`INSERT INTO message_templates(id,name,status,title,content,variables) VALUES($1,$2,'published',$3,$4,$5) ON CONFLICT(id) DO NOTHING`,[tid,name,title,content,JSON.stringify([])])
  if (process.env.ADMIN_PHONE && process.env.ADMIN_PASSWORD) {
    await db.query(`INSERT INTO users(id,phone,nickname,role,password_hash,invite_code,account_kind) VALUES($1,$2,'最高管理员','superadmin',$3,$4,'admin') ON CONFLICT(phone,account_kind) DO NOTHING`, [id(), process.env.ADMIN_PHONE, passwordHash(process.env.ADMIN_PASSWORD), String(randomInt(10000000, 99999999))])
  }
  if (process.env.APP_MODE === 'production') return
  for (const [examId, name] of [['junior-social-worker','初级社会工作师'],['mid-social-worker','中级社会工作师']]) {
    await db.query('INSERT INTO exams(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING', [examId,name])
    for (let year = 2026; year <= 2029; year++) await db.query(`INSERT INTO exam_cycles(id,exam_id,year,ends_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [`${examId}-${year}`,examId,year,`${year}-05-31T23:59:59+08:00`])
  }
  const categories = [
    ['social-work', null, '社会工作', 10],
    ['social-worker-exam', 'social-work', '社会工作者考试', 10],
  ] as const
  for (const [categoryId, parentId, name, sort] of categories) await db.query('INSERT INTO exam_categories(id,parent_id,name,sort_order) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [categoryId, parentId, name, sort])
  await db.query("UPDATE exams SET category_id='social-worker-exam' WHERE id IN ('junior-social-worker','mid-social-worker') AND category_id IS NULL")
  await db.query("INSERT INTO exam_plan_configs(exam_id,prep_days,sprint_days,default_rest_days) VALUES('junior-social-worker',90,14,1),('mid-social-worker',120,14,1) ON CONFLICT(exam_id) DO NOTHING")
  const put = async (itemId: string, kind: string, title: string, payload: any, parent: string | null = null, examId: string | null = 'junior-social-worker') => db.query(`INSERT INTO content(id,exam_id,kind,parent_id,title,status,payload,source) VALUES($1,$2,$3,$4,$5,'published',$6,'demo_test') ON CONFLICT DO NOTHING`, [itemId,examId,kind,parent,title,JSON.stringify({ ...payload,isTestData: true })])
  for (const subject of knowledgeSubjects) {
    await put(subject.id, 'subject', subject.name, { ...subject, chapters: undefined })
    for (const chapter of subject.chapters) {
      await put(chapter.id, 'chapter', chapter.name, { ...chapter, sections: undefined }, subject.id)
      for (const section of chapter.sections) {
        await put(section.id, 'section', section.name, { ...section, points: undefined }, chapter.id)
        for (const point of section.points) await put(point.id, 'knowledge', point.title, point, section.id)
      }
    }
  }
  for (const course of courseCatalog) {
    await put(course.id, 'course', course.sectionName, { ...course, requiredLevel: 'vip' }, course.sectionId)
    await db.query('INSERT INTO course_links(course_id,target_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [course.id,course.sectionId])
    if (course.hasHandout) await put(`handout-${course.id}`, 'handout', course.handoutName, { courseId: course.id, version: 1, downloadUrl: '', requiredLevel: 'vip' }, course.id)
  }
  const pointCourse = { ...courseCatalog[0], id: 'course-point-kp-1-1-1', knowledgePointId: 'kp-1-1-1', sectionName: '社会层面的目标 · 知识点精讲', type: 'article', typeName: '图文', intro: '【测试内容】围绕社会层面的目标，结合解决社会问题、促进社会公平等情境进行专项讲解。', progress: 0, currentMinute: 0, requiredLevel: 'vip' }
  await put(pointCourse.id,'course',pointCourse.sectionName,pointCourse,'kp-1-1-1')
  await db.query('INSERT INTO course_links(course_id,target_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [pointCourse.id,'kp-1-1-1'])
  for (const question of practiceQuestions) await put(question.id, 'question', question.stem, question, question.knowledgePointId)
  const mid='mid-social-worker'
  await put('mid-subject-test','subject','【测试内容】社会工作综合能力（中级）',{color:'#3569e8',icon:'map'},null,mid)
  await put('mid-chapter-test','chapter','【测试内容】社会工作专业价值观',{no:1},'mid-subject-test',mid)
  await put('mid-section-test','section','【测试内容】专业伦理',{no:1},'mid-chapter-test',mid)
  await put('mid-point-test','knowledge','【测试内容】服务对象自决',{stars:4,content:'【测试内容】社会工作者应尊重服务对象在充分知情基础上的选择，同时结合安全、法律和专业伦理评估行动边界。此内容仅用于流程验证。',mastery:0,questionDone:0,questionTotal:1},'mid-section-test',mid)
  await put('mid-question-test','question','【测试内容】制定服务计划时，哪项做法体现服务对象自决？',{type:'single',stem:'【测试内容】制定服务计划时，哪项做法体现服务对象自决？',options:['充分说明可行方案，由服务对象参与选择','替服务对象决定全部事项','不告知风险直接实施','拒绝讨论服务目标'],answer:[0],explanation:'【测试内容】在充分知情基础上参与选择体现自决。',knowledgePointId:'mid-point-test',year:'',source:''},'mid-point-test',mid)
  await put('mid-course-test','course','【测试内容】专业伦理知识点精讲',{type:'article',typeName:'图文',intro:'【测试内容】知识点关联课程示例',totalMinutes:5,hasHandout:false,canTrial:true,requiredLevel:'vip',articleSections:[{title:'【测试内容】尊重自决',paragraphs:['告知可行方案、说明风险、尊重选择，并记录共同制定的服务计划。']}]},'mid-point-test',mid)
  for (const article of examNotices) await put(article.id, 'article', article.title, article, null, null)
  for (const [kind, name] of [['announcement','系统公告'],['faq','常见问题']]) {
    for (let n=1;n<=6;n++) await put(`${kind}-${n}`,kind,`【测试内容】${name} ${n}`,{ content: kind === 'faq' ? '可在学习服务中查看课程、讲义、学习计划和订单。正式客服与服务协议待配置。' : '本机业务测试正在进行，订单为模拟支付，不产生真实扣款。',publisher:'上行宝'},null,null)
  }
  for (const [feature, name] of Object.entries(featureNames)) {
    await db.query('INSERT INTO ai_features(id,name,config) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [feature,name,JSON.stringify({ provider:'APIKEY.FUN',baseUrl:'https://api.apikey.fun/v1',protocol:'responses',mode:'mock',...pricePresets[2],maxTokens:2048,timeoutSeconds:45,dailyLimit:20,prompt:'你是社会工作考试学习助手。仅根据提供的资料回答；依据不足请明确说明。不得编造考试政策、分数或引用。' })])
  }
  if(process.env.APP_MODE!=='production') await seedTestStudents()
}

async function seedTestStudents() {
  const examId='junior-social-worker'
  const cycle=(await db.query('SELECT * FROM exam_cycles WHERE exam_id=$1 AND ends_at>now() ORDER BY ends_at LIMIT 1',[examId])).rows[0]
  if(!cycle)return
  for(const [suffix,level] of [['001','svip'],['002','vip'],['003','free']]) {
    await transaction(async c=>{
      const uid=`test-student-${suffix}`
      const inserted=(await c.query(`INSERT INTO users(id,phone,nickname,invite_code,is_test_data) VALUES($1,$2,$3,$4,true) ON CONFLICT DO NOTHING RETURNING id`,[uid,`13900000${suffix}`,`【测试学员】${level.toUpperCase()}`,`90000${suffix}`])).rows
      if(!inserted.length)return
      const joined=new Date();joined.setUTCMonth(joined.getUTCMonth()-2);joined.setUTCDate(2)
      if(level!=='free') {
        const orderId=`TEST-${suffix}-${cycle.id}`
        await c.query(`INSERT INTO orders(id,user_id,exam_id,cycle_id,product,amount_cents,status,created_at,expires_at,paid_at,is_test_data) VALUES($1,$2,$3,$4,$5,$6,'paid',$7,$7,$7,true)`,[orderId,uid,examId,cycle.id,level,level==='svip'?79900:59900,joined.toISOString()])
        await c.query(`INSERT INTO payments(id,order_id,status,method,is_test_data) VALUES($1,$2,'success','wechat_test',true)`,[`test-payment-${suffix}`,orderId])
        await c.query('INSERT INTO memberships(order_id,user_id,exam_id,cycle_id,level,starts_at) VALUES($1,$2,$3,$4,$5,$6)',[orderId,uid,examId,cycle.id,level,joined.toISOString()])
      }
      for(let day=1;day<=45;day+=3) {
        const when=new Date(Date.now()-day*86400000).toISOString()
        await c.query(`INSERT INTO learning_events(id,user_id,exam_id,kind,source_id,minutes,created_at) VALUES($1,$2,$3,'knowledge','kp-1-1-1',5,$4)`,[id(),uid,examId,when])
        const q=practiceQuestions[day%practiceQuestions.length]
        await c.query('INSERT INTO answers(id,user_id,exam_id,question_id,selection,correct,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id(),uid,examId,q.id,JSON.stringify(q.answer),day%4!==0,when])
      }
    })
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { await seed(); console.log('Seed completed without overwriting existing records'); await closeDatabase() }

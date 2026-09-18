<script setup lang="ts">
import { defaultGradingPrompt } from '../../shared/grading-prompt'
import RecordIdentifier from './RecordIdentifier.vue'
import AIModelConnection from './AIModelConnection.vue'
import QuestionTypes from './QuestionTypes.vue'
import QuestionEditor from './QuestionEditor.vue'
import QuestionTransfer from './QuestionTransfer.vue'
import QuestionList from './QuestionList.vue'
const questionList=ref<InstanceType<typeof QuestionList>|null>(null)
const questionTypesPage=ref<InstanceType<typeof QuestionTypes>|null>(null)
const questionEditor=ref<InstanceType<typeof QuestionEditor>|null>(null)
const questionTransfer=ref<InstanceType<typeof QuestionTransfer>|null>(null)
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch, toRaw } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, LayoutDashboard, LibraryBig, BookOpen, GraduationCap, FileText, Users, CreditCard, Sparkles, Settings2, ScrollText, Search, Plus, Upload, Download, ArrowUpRight, ArrowRight, ChevronRight, LogOut, RefreshCw, ShieldCheck, CalendarDays, Check, X, Menu, SlidersHorizontal, ClipboardList, Bell, HelpCircle, Eye, Pencil, CircleCheck, CircleAlert, Activity } from 'lucide-vue-next'
import { request, send } from './api'
import AdminLogin from './AdminLogin.vue'
import AdministratorManagement from './AdministratorManagement.vue'
const administratorManagement=ref<InstanceType<typeof AdministratorManagement>|null>(null)
import UserEntitlements from './UserEntitlements.vue'
import UserManagement from './UserManagement.vue'
import ContentPreview from './ContentPreview.vue'
const contentPreview=ref<InstanceType<typeof ContentPreview>|null>(null)
const userManagement=ref<InstanceType<typeof UserManagement>|null>(null)
import ExamCategories from './ExamCategories.vue'
import ExamProjects from './ExamProjects.vue'
import RichEditor from './RichEditor.vue'
import PermissionManagement from './PermissionManagement.vue'
import NodeCourses from './NodeCourses.vue'
import CourseEditor from './CourseEditor.vue'
import CourseManagement from './CourseManagement.vue'
import ProductManagement from './ProductManagement.vue'
import OrderManagement from './OrderManagement.vue'
import LearningData from './LearningData.vue'
import ArticleManagement from './ArticleManagement.vue'
const articleManagement=ref<InstanceType<typeof ArticleManagement>|null>(null)
const learningData=ref<InstanceType<typeof LearningData>|null>(null)
const orderManagement=ref<InstanceType<typeof OrderManagement>|null>(null)
const productManagement=ref<InstanceType<typeof ProductManagement>|null>(null)
import ResourceManagement from './ResourceManagement.vue'
import CheatsheetManagement from './CheatsheetManagement.vue'
const cheatsheetManagement=ref<InstanceType<typeof CheatsheetManagement>|null>(null)
const resourceManagement=ref<InstanceType<typeof ResourceManagement>|null>(null)
const courseManagement=ref<InstanceType<typeof CourseManagement>|null>(null)
import KnowledgeParentFields from './KnowledgeParentFields.vue'
const courseEditor=ref<InstanceType<typeof CourseEditor>|null>(null)
const courseManagerNode=ref<any>(null),courseManagerVersion=ref(0),nodeHasCourse=ref(false)
async function createNodeCourse(node:any){
 try{
  const courses=await request('/admin/content?'+new URLSearchParams({kind:'course',parentId:node.id,examId:node.exam_id}))
  if(courses.total>1){courseManagerNode.value=node;return}
  if(courses.total===1){await courseEditor.value?.open(courses.items[0]);return}
  await courseEditor.value?.open({id:crypto.randomUUID(),kind:'course',exam_id:node.exam_id,parent_id:node.id,title:'',status:'draft',payload:{type:'article',requiredLevel:'vip',handouts:[]},source:'manual',is_test_data:node.is_test_data})
 }catch(e:any){ElMessage.error(e.message)}
}
async function courseSaved(){courseManagerVersion.value++;await load()}
import ContentTable from './ContentTable.vue'
import ImportWizard from './ImportWizard.vue'
import ContentOrigin from './ContentOrigin.vue'
import BulkContentManager from './BulkContentManager.vue'
const bulkContentDialog=ref(false),bulkContentBusy=ref(false)
import MessageManagement from './MessageManagement.vue'
import ReferralManagement from './ReferralManagement.vue'
import SystemSettings from './SystemSettings.vue'
import DataDictionary from './DataDictionary.vue'
import AuditManagement from './AuditManagement.vue'
import {auditActionLabel} from '../../shared/audit'
const dataDictionary=ref<InstanceType<typeof DataDictionary>|null>(null)
const auditManagement=ref<InstanceType<typeof AuditManagement>|null>(null)
import PageAgentAssistant from './PageAgentAssistant.vue'
import './styles/graph-theme.css'
const settingsSection=ref('basic')
const platformLogo=ref(''),platformLogoFailed=ref(false)
const platformMode=ref('')
async function loadBrand(){
 try{const settings=await request('/site-settings');platformLogo.value=settings.basic.logo||'';platformLogoFailed.value=false;platformMode.value=settings.environment||''}catch{/* Keep the current brand if settings are temporarily unavailable. */}
}
function refreshBrandOnFocus(){void loadBrand()}
onMounted(()=>{void loadBrand();window.addEventListener('focus',refreshBrandOnFocus)})
onUnmounted(()=>window.removeEventListener('focus',refreshBrandOnFocus))
import KnowledgeGraph from './KnowledgeGraph.vue'
import StyleComponents from './StyleComponents.vue'
import { splitKnowledgeHandouts } from '../../shared/knowledge-handouts'
import './styles/components.css'
const resourceBusy=ref(false)
const importHistory=ref<InstanceType<typeof ImportWizard>>()
const knowledgeGraph=ref<InstanceType<typeof KnowledgeGraph>|null>(null)
const examProjects=ref<any>(null)
const examCategories=ref<any>(null)

const token=ref(sessionStorage.getItem('sxb-admin-token')||'')
const identity=ref<any>(null)
const loginForm=reactive({phone:'',password:''})
const loginError=ref(''); const loginBusy=ref(false)
const navigation=[
  {section:'总览',items:[{id:'dashboard',name:'工作台',icon:LayoutDashboard}]},
  {section:'基础架构',items:[{id:'exam-categories',name:'考试分类',icon:CalendarDays},{id:'exam-projects',name:'考试项目',icon:CalendarDays},{id:'knowledge-graph',name:'知识图谱',icon:LibraryBig}]},
{section:'教学内容',items:[{id:'question-types',name:'题型管理',icon:ClipboardList},{id:'question',name:'题目管理',icon:BookOpen},{id:'course',name:'课程管理',icon:GraduationCap},{id:'learning-plan',name:'学习计划',icon:Activity},{id:'cheatsheet',name:'考前小抄',icon:FileText}]},
  {section:'用户与权益',items:[{id:'users',name:'用户管理',icon:Users},{id:'permissions',name:'会员权益',icon:ShieldCheck}]},
  {section:'交易管理',items:[{id:'products',name:'商品管理',icon:CreditCard},{id:'orders',name:'订单管理',icon:CreditCard},{id:'finance',name:'财务管理',icon:CreditCard}]},
  {section:'运营管理',items:[{id:'records',name:'学习数据',icon:Activity},{id:'message-template',name:'消息模板',icon:Bell},{id:'message-center',name:'消息中心',icon:Activity},{id:'referrals',name:'推荐码',icon:Users},{id:'articles',name:'文章内容',icon:FileText}]},
  {section:'系统管理',items:[{id:'administrators',name:'管理员管理',icon:ShieldCheck},{id:'roles',name:'角色管理',icon:Settings2},{id:'media',name:'资源管理',icon:FileText},{id:'style-components',name:'公共组件',icon:Settings2},{id:'ai',name:'AI 配置与数据',icon:Sparkles},{id:'data-dictionary',name:'数据字典',icon:LibraryBig},{id:'audit',name:'操作日志',icon:ScrollText},{id:'settings',name:'系统设置',icon:Settings2}]}
]
const openGroup=ref('总览')
const groupIcons:Record<string,typeof LayoutDashboard>={'总览':LayoutDashboard,'基础架构':LibraryBig,'教学内容':BookOpen,'用户与权益':Users,'交易管理':CreditCard,'运营管理':Activity,'系统管理':Settings2}
const pendingViews=['finance','learning-plan']
const pendingPage=computed(()=>pendingViews.includes(view.value))
function resolveView(){
  const id=location.hash.slice(1)||'dashboard'
  const destination=({knowledge:'knowledge-graph',faq:'articles',exams:'exam-projects',article:'exam-projects'} as Record<string,string>)[id]
  if(!destination)return id
  history.replaceState(history.state,'',location.pathname+location.search+'#'+destination)
  return destination
}
const view=ref(resolveView())
const currentNav=computed(()=>navigation.flatMap(g=>g.items).find(x=>x.id===view.value)||navigation[0].items[0])
const currentGroup=computed(()=>navigation.find(g=>g.items.some(x=>x.id===currentNav.value.id))?.section||'总览')
const mobileNav=ref(false)
const busy=ref(false);const error=ref('');const saving=ref(false)
const dashboard=ref<any>(null);const rows=ref<any[]>([]);const total=ref(0);const page=ref(1);const search=ref('');const treeKind=ref('knowledge')
const exams=ref<any[]>([]);const contentOptions=ref<any[]>([]);const aiFeatures=ref<any[]>([]);const prices=ref<any[]>([]);const developerFilter=ref('')
const entitlementUser=ref<{id:string;nickname:string;phone:string}|null>(null)
const messageManagement=ref<any>(null)
watch(token,value=>{if(!value)entitlementUser.value=null})
const labels:Record<string,string>={subject:'科目',chapter:'章',section:'节',knowledge:'知识点',question:'题目',course:'课程',handout:'讲义',article:'考前须知',announcement:'消息',faq:'常见问题',draft:'草稿',review:'审核中',published:'已发布',offline:'已下架',pending_payment:'待支付',paid:'支付成功',closed:'已关闭',refunding:'退款中',refunded:'已退款',vip:'VIP',svip:'SVIP',trial:'VIP 24小时体验',upgrade:'VIP 升 SVIP',superadmin:'最高管理员',student:'学生',success:'成功',failed:'失败',note:'笔记',favorite:'收藏',plan:'学习计划',courseProgress:'课程进度',recite:'背诵',announcementRead:'消息已读'}
labels.cheatsheet='考前小抄'
const contentViews=['knowledge','question','course','handout','article','cheatsheet']
const isContent=computed(()=>contentViews.includes(view.value))
const kind=computed(()=>view.value==='knowledge'?treeKind.value:view.value==='articles'?'faq':view.value)
const formatDate=(v:any)=>v?new Date(v).toLocaleString('zh-CN',{hour12:false}):'—'
const money=(v:any)=>'¥'+Number(v||0).toFixed(2)
const tokenNumber=(v:any)=>v===null||v===undefined?'未返回':Number(v).toLocaleString('zh-CN')
const stateColor=(s:string)=>['published','paid','success'].includes(s)?'success':['review','pending_payment','refunding'].includes(s)?'warning':['failed'].includes(s)?'danger':'info'
async function login(captchaProof:string){if(loginBusy.value)return;loginBusy.value=true;loginError.value='';try{const r=await send('/auth/admin',{...loginForm,captchaProof});token.value=r.token;identity.value=r.user;sessionStorage.setItem('sxb-admin-token',r.token);loginForm.password='';await load()}catch(e:any){loginError.value=e.message}finally{loginBusy.value=false}}
async function logout(){try{await send('/auth/logout',{})}finally{token.value='';sessionStorage.removeItem('sxb-admin-token');identity.value=null}}
function unauthorized(){token.value='';identity.value=null;sessionStorage.removeItem('sxb-admin-token')}
function categoryNew(){examCategories.value?.open()}
function projectNew(){examProjects.value?.open()}
function navigate(id:string){location.hash=id;view.value=resolveView();openGroup.value=navigation.find(g=>g.items.some(item=>item.id===view.value))?.section||'总览';mobileNav.value=false;page.value=1;search.value=''}
const referralManagement=ref<any>(null)
function openReferral(){referralManagement.value?.openNew()}
function hashChange(){view.value=resolveView();openGroup.value=navigation.find(g=>g.items.some(item=>item.id===view.value))?.section||'总览'}
let revision=0
async function load(){
  if(!token.value)return
  const rev=++revision;busy.value=true;error.value='';rows.value=[]
  try{
    if(pendingPage.value)return
    if(view.value==='audit'){await auditManagement.value?.load();return}
    if(view.value==='data-dictionary'){await dataDictionary.value?.load();return}
    if(!exams.value.length)exams.value=await request('/exams')
    if(view.value==='question-types'){await questionTypesPage.value?.load();return}
    if(view.value==='question'){await questionList.value?.load();return}
    if(view.value==='course'){await courseManagement.value?.load();return}
    if(view.value==='products'){await productManagement.value?.load();return}
    if(view.value==='orders'){await orderManagement.value?.load();return}
    if(view.value==='articles'){await articleManagement.value?.load();return}
    if(view.value==='users'){await userManagement.value?.load();return}
    if(view.value==='administrators'){await administratorManagement.value?.load();return}
    if(view.value==='records'){await learningData.value?.load();return}
    if(view.value==='media'){await resourceManagement.value?.load();return}
    if(view.value==='cheatsheet'){await cheatsheetManagement.value?.load();return}
    if(view.value==='knowledge-graph'){await knowledgeGraph.value?.load();return}
    if(view.value==='exam-projects'){await examProjects.value?.load();return}
    if(view.value==='exam-categories'){await examCategories.value?.load();return}
    if(['administrators','permissions','message-template','message-center','referrals','settings','style-components','knowledge-graph'].includes(view.value)) return
    if(view.value==='dashboard')dashboard.value=await request('/admin/dashboard')
    else if(view.value==='ai'){const r=await request('/admin/ai');aiFeatures.value=r.features;prices.value=r.prices}
    else if(isContent.value){const r=await request(`/admin/content?kind=${kind.value}&search=${encodeURIComponent(search.value)}&page=${page.value}`);if(rev===revision){rows.value=r.items;total.value=r.total}}
    else if(view.value==='users'){const suffix=developerFilter.value?`&developer=${developerFilter.value}`:'';const r=await request(`/admin/users?search=${encodeURIComponent(search.value)}${suffix}`);if(rev===revision)rows.value=r}
    else {const r=await request('/admin/'+view.value);if(rev===revision)rows.value=r}
  }catch(e:any){if(rev===revision)error.value=e.message}finally{if(rev===revision)busy.value=false}
}
watch([view,page,treeKind],load)
onMounted(async()=>{window.addEventListener('sxb-unauthorized',unauthorized);window.addEventListener('hashchange',hashChange);if(token.value){try{identity.value=await request('/me');await load()}catch(e:any){error.value=e.message}}})
onUnmounted(()=>{window.removeEventListener('sxb-unauthorized',unauthorized);window.removeEventListener('hashchange',hashChange)})

const editor=ref(false);const edit=ref<any>({});const editError=ref('');const optionText=ref('');const answerText=ref('');const advanced=ref(false);const payloadText=ref('')
async function persistContent(row:any,previewAfter=false){
  await send('/admin/content/'+row.id,row,'PUT');editor.value=false;ElMessage.success('内容已保存');await load()
  if(previewAfter)contentPreview.value?.open(row)
}
function questionAssociationChanged(ids:string[]){if(!ids.includes(edit.value.parent_id))edit.value.parent_id=ids[0]||null}
function pointLabel(p:any){const path=[p.title];let parent=contentOptions.value.find(x=>x.id===p.parent_id);while(parent){path.unshift(parent.title);parent=contentOptions.value.find(x=>x.id===parent.parent_id)}return path.join(' / ')}
function changeContentExam(){edit.value.parent_id=null;if(edit.value.kind==='question')edit.value.payload.knowledgePointIds=[]}
const parentOptions=computed(()=>contentOptions.value.filter(x=>x.exam_id===edit.value.exam_id && ({chapter:['subject'],section:['chapter'],knowledge:['section'],question:['knowledge'],course:['section','knowledge'],handout:['course']} as any)[edit.value.kind]?.includes(x.kind)))
async function openEditor(row?:any){
  if(row?.kind==='faq'){navigate('articles');await nextTick();await articleManagement.value?.open(row);return}
  if((row?.kind||kind.value)==='question'){await questionEditor.value?.open(row);return}
  if(row?.kind==='course'){await courseEditor.value?.open(row);return}
  contentOptions.value=await request('/admin/content-options')
  edit.value=row?structuredClone(toRaw(row)):{id:crypto.randomUUID(),kind:kind.value,exam_id:['article','announcement','faq'].includes(kind.value)?null:exams.value[0]?.id,parent_id:null,title:'',status:'draft',payload:{stars:3,type:kind.value==='course'?'article':'single',options:[],answer:[],requiredLevel:'vip'},source:'test',is_test_data:true}
  if(edit.value.kind==='question')edit.value.payload.knowledgePointIds=edit.value.payload.knowledgePointIds||[edit.value.parent_id].filter(Boolean)
  if(edit.value.kind==='knowledge')Object.assign(edit.value.payload,splitKnowledgeHandouts(edit.value.payload))
  nodeHasCourse.value=false
  if(['section','knowledge'].includes(edit.value.kind)&&edit.value.version)nodeHasCourse.value=(await request('/admin/content?kind=course&parentId='+encodeURIComponent(edit.value.id)+'&examId='+encodeURIComponent(edit.value.exam_id))).total>0
  optionText.value=(edit.value.payload.options||[]).join('\n');answerText.value=(edit.value.payload.answer||[]).map((i:number)=>String.fromCharCode(65+i)).join(',')
  payloadText.value=JSON.stringify(edit.value.payload,null,2);advanced.value=false;editError.value='';editor.value=true
}
async function locateResource(reference:any){
 try{
  if(reference.kind==='import-job'){await importHistory.value?.open({jobId:reference.id});return}
  if(reference.kind==='site-settings'){settingsSection.value=reference.id;navigate('settings');return}
  if(reference.kind==='learning-answer'){navigate('records');await nextTick();await learningData.value?.openAnswer(reference.id);return}
  const row=await request('/admin/resources/location?'+new URLSearchParams({kind:reference.kind,id:reference.id}))
  if(reference.kind==='exam'){
   const projects=await request('/admin/exam-projects');navigate('exam-projects');await nextTick();const year=/^(\d{4}) 年 · 了解考试$/.exec(reference.location||'');examProjects.value?.open(projects.find((p:any)=>p.id===row.id),year?Number(year[1]):undefined);return
  }
  if(reference.kind==='product'){const products=await request('/admin/products');navigate('products');await nextTick();productManagement.value?.open(products.find((p:any)=>p.id===row.id));return}
  if(reference.kind==='category'){navigate('exam-categories');await nextTick();examCategories.value?.open(row);return}
  if(reference.kind==='message'||reference.kind==='message-template'){navigate(reference.kind==='message'?'message-center':'message-template');await nextTick();messageManagement.value?.openReference(row);return}
  await openEditor(row)
 }catch(e:any){ElMessage.error(e.message)}
}
async function saveContent(previewAfter=false){
  if(resourceBusy.value||saving.value)return
  saving.value=true;editError.value=''
  try{
    const row=JSON.parse(JSON.stringify(edit.value))
    if(advanced.value)row.payload=JSON.parse(payloadText.value)
    if(row.kind==='question'){
      row.payload={...row.payload,stem:row.title,knowledgePointId:row.parent_id,options:optionText.value.split('\n').map(s=>s.trim()).filter(Boolean),answer:answerText.value?answerText.value.toUpperCase().split(/[,，\s]+/).join('').split('').map((s:string)=>s.charCodeAt(0)-65):[]}
    }
    if(row.kind==='knowledge'){
      row.payload.title=row.title
      row.payload.isKnowledgeCourse=nodeHasCourse.value
    }
    if(row.kind==='course')row.payload.sectionName=row.title
    await persistContent(row,previewAfter)
  }catch(e:any){editError.value=e.message}finally{saving.value=false}
}
const dateDialog=ref(false);const dateEdit=ref<any>({});const dateError=ref('')
function openDate(row:any){dateEdit.value={...row,endsAt:row.ends_at};dateError.value='';dateDialog.value=true}
async function saveDate(){saving.value=true;try{await send('/admin/exams/'+dateEdit.value.id,{endsAt:new Date(dateEdit.value.endsAt).toISOString()},'PUT');dateDialog.value=false;await load();ElMessage.success('考试日期已更新')}catch(e:any){dateError.value=e.message}finally{saving.value=false}}
const planDialog=ref(false);const planEdit=ref<any>({});const planError=ref('')
async function openPlanConfig(row:any){planError.value='';try{planEdit.value={...(await request('/admin/exams/'+row.exam_id+'/plan-config')),name:row.name,examId:row.exam_id};planDialog.value=true}catch(e:any){planError.value=e.message}}
async function savePlanConfig(){saving.value=true;planError.value='';try{await send('/admin/exams/'+planEdit.value.examId+'/plan-config',{prepDays:Number(planEdit.value.prepDays),sprintDays:Number(planEdit.value.sprintDays),defaultRestDays:Number(planEdit.value.defaultRestDays),defaultRound:planEdit.value.defaultRound},'PUT');planDialog.value=false;ElMessage.success('学习计划规则已保存')}catch(e:any){planError.value=e.message}finally{saving.value=false}}

const aiDiscovering=ref(false),aiEditorKey=ref(0)
const aiDialog=ref(false);const aiEdit=ref<any>({});const aiError=ref('');const aiTest=ref<Record<string,any>>({});const testing=ref('')
function configure(row:any){aiEditorKey.value++;aiDiscovering.value=false;aiEdit.value={...structuredClone(toRaw(row)),apiKey:''};aiError.value='';aiDialog.value=true}
async function saveAI(){if(!aiEdit.value.config.model){aiError.value='请测试获取模型并选择模型';return}saving.value=true;aiError.value='';try{await send('/admin/ai/'+aiEdit.value.id,aiEdit.value,'PUT');aiDialog.value=false;await load();if(aiEdit.value.id==='page-agent')window.dispatchEvent(new Event('sxb-agent-settings'));ElMessage.success('AI配置已保存')}catch(e:any){aiError.value=e.message}finally{saving.value=false}}
async function toggleAI(row:any,value:any){try{await send('/admin/ai/'+row.id,{enabled:Boolean(value),config:row.config,revision:row.revision},'PUT');row.enabled=Boolean(value);await load();if(row.id==='page-agent')window.dispatchEvent(new Event('sxb-agent-settings'))}catch(e:any){ElMessage.error(e.message)}}
async function testAI(row:any){
  if(row.config.mode==='live'){try{await ElMessageBox.confirm('将向中转商发送一条固定测试请求，可能产生少量费用。是否继续？','测试真实接口',{confirmButtonText:'发送测试',cancelButtonText:'取消',type:'warning'})}catch{return}}
  testing.value=row.id
  try{aiTest.value[row.id]=await send('/admin/ai/'+row.id+'/test',{});const r=aiTest.value[row.id];r.status==='success'?ElMessage.success(r.mode==='mock'?'本地测试适配器连通，未调用中转商':'真实接口测试成功'):ElMessage.error(r.error)}catch(e:any){ElMessage.error(e.message)}finally{testing.value=''}
}
const usageDialog=ref(false);const usageFeature=ref<any>(null);const usageDay=ref(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}));const usage=ref<any>({rows:[],summary:{}});const usageLoading=ref(false)
async function loadUsage(){if(!usageFeature.value||!usageDay.value)return;usageLoading.value=true;try{usage.value=await request('/admin/ai/'+usageFeature.value.id+'/usage?day='+usageDay.value)}catch(e:any){ElMessage.error(e.message)}finally{usageLoading.value=false}}
function openUsage(row:any){usageFeature.value=row;usageDialog.value=true;loadUsage()}
watch(usageDay,loadUsage)
const inspect=ref<any>(null)

const importDialog=ref(false);const importExam=ref('junior-social-worker');const importPreview=ref<any>(null);const importTest=ref(true);const importError=ref('');const importBusy=ref(false)
async function downloadTemplate(){try{const r=await fetch('/api/admin/import/template',{headers:{Authorization:'Bearer '+token.value}});if(!r.ok)throw new Error('模板下载失败');const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;a.download='题库导入模板.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e:any){ElMessage.error(e.message)}}
async function uploadFile(event:Event){
  const file=(event.target as HTMLInputElement).files?.[0];if(!file)return
  importBusy.value=true;importError.value='';importPreview.value=null
  try{if(file.size>8*1024*1024)throw new Error('文件不能超过8MB');const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file)});importPreview.value=await send('/admin/import/preview',{examId:importExam.value,filename:file.name,data})}catch(e:any){importError.value=e.message}finally{importBusy.value=false;(event.target as HTMLInputElement).value=''}
}
async function commit(){importBusy.value=true;try{const r=await send('/admin/import/'+importPreview.value.id+'/commit',{isTest:importTest.value});ElMessage.success(`${r.count} 道题已导入草稿`);importDialog.value=false;await load()}catch(e:any){importError.value=e.message}finally{importBusy.value=false}}
</script>

<template>
  <AdminLogin v-if="!token" v-model:phone="loginForm.phone" v-model:password="loginForm.password" :busy="loginBusy" :error="loginError" :logo="platformLogo" @submit="login" />
  <div v-else class="admin-shell">
    <a class="skip-link" href="#workspace">跳至主要内容</a>
    <div v-if="mobileNav" class="nav-scrim" @click="mobileNav=false"></div>
    <aside class="sidebar" :class="{open:mobileNav}" data-page-agent-ignore="true">
      <a href="#dashboard" class="brand" @click.prevent="navigate('dashboard')"><span class="brand-icon" :class="{'has-logo':platformLogo&&!platformLogoFailed}"><img v-if="platformLogo&&!platformLogoFailed" :src="platformLogo" alt="" @error="platformLogoFailed=true"/><GraduationCap v-else :size="24" aria-hidden="true" /></span><span><strong>上行宝</strong><small>管理工作空间</small></span></a>
      <nav aria-label="后台导航">
        <section v-for="(group,index) in navigation" :key="group.section" class="nav-group" :class="{'is-open':openGroup===group.section}">
          <button class="nav-group-toggle" :aria-expanded="openGroup===group.section" :aria-controls="'nav-group-'+index" @click="openGroup=openGroup===group.section?'':group.section">
            <span class="nav-group-icon"><component :is="groupIcons[group.section]" :size="19" :stroke-width="1.7" aria-hidden="true" /></span><span class="nav-group-label">{{ group.section }}</span><ChevronRight class="nav-chevron" :size="15" :class="{rotated:openGroup===group.section}" aria-hidden="true" />
          </button>
          <div v-show="openGroup===group.section" :id="'nav-group-'+index" class="nav-children">
            <button v-for="item in group.items" :key="item.id" class="nav-item" :class="{active:view===item.id}" :aria-current="view===item.id?'page':undefined" @click="navigate(item.id)">
              <span class="nav-item-dot" aria-hidden="true"></span><span>{{ item.name }}</span>
            </button>
          </div>
        </section>
      </nav>
      <div class="sidebar-foot"><span class="environment-dot"></span>{{platformMode==='production'?'生产环境':platformMode==='test'?'测试环境':'环境读取中'}}<span>v0.2</span></div>
    </aside>
    <div class="shell-main">
      <header class="topbar" data-page-agent-ignore="true"><nav class="breadcrumb" aria-label="面包屑导航"><button class="icon-button mobile-toggle" aria-label="打开菜单" @click="mobileNav=true"><Menu :size="20" /></button><span>{{ currentGroup }}</span><ChevronRight :size="14" aria-hidden="true" /><strong aria-current="page">{{ currentNav.name }}</strong></nav><div class="topbar-actions"><PageAgentAssistant :page="view"/><span class="test-indicator" :class="{'is-production':platformMode==='production'}">{{platformMode==='production'?'生产环境':platformMode==='test'?'测试环境':'环境读取中'}}</span><span class="avatar">管</span><div class="account"><strong>{{ identity?.nickname||'最高管理员' }}</strong><small>{{ identity?.phone }}</small></div><el-tooltip content="退出登录"><button class="icon-button" aria-label="退出登录" @click="logout"><LogOut :size="18" /></button></el-tooltip></div></header>
      <main id="workspace" class="workspace" tabindex="-1">
        <div class="page-heading"><div><div class="eyebrow">{{ view==='dashboard'?'WORKSPACE OVERVIEW':view==='ai'?'AI OPERATIONS':'SXB CONSOLE' }}</div><h1>{{ currentNav.name }}</h1><p v-if="view==='dashboard'">{{ new Date().toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'}) }} · 内容与业务概况</p><p v-else-if="view==='ai'">模型连接、功能权限与调用用量</p><p v-else-if="view==='orders'">商品定价与订单记录 · 权益按考试、考期生效</p></div><div class="heading-actions"><el-button v-if="['course','articles','cheatsheet'].includes(view)" @click="bulkContentDialog=true">批量操作</el-button><el-button v-if="view==='products'" type="primary" @click="productManagement?.open()"><Plus :size="17"/>新增商品</el-button><el-tooltip content="刷新数据"><el-button circle :loading="busy" aria-label="刷新数据" @click="load"><RefreshCw :size="17" /></el-button></el-tooltip><el-button v-if="view==='knowledge-graph'" @click="bulkContentDialog=true">批量操作</el-button><el-button v-if="view==='articles'" type="primary" @click="articleManagement?.open()"><Plus :size="17"/>新增文章</el-button><el-button v-if="view==='administrators'" type="primary" @click="administratorManagement?.open()"><Plus :size="17"/>新增管理员</el-button><el-button v-if="view==='knowledge-graph' && knowledgeGraph?.isDetail" @click="knowledgeGraph?.importExcel()"><Upload :size="17"/>导入</el-button><el-button v-if="view==='knowledge-graph' && knowledgeGraph?.isDetail" :loading="knowledgeGraph?.exportBusy" :aria-busy="knowledgeGraph?.exportBusy" @click="knowledgeGraph?.exportExcel()" aria-label="导出知识图谱 Excel"><Download :size="17" aria-hidden="true"/>导出</el-button><el-button v-if="view==='knowledge-graph' && knowledgeGraph?.isDetail" @click="knowledgeGraph?.back()" aria-label="返回考试列表"><ArrowLeft :size="17" />返回</el-button><el-button v-if="view==='message-template'||view==='message-center'" type="primary" @click="messageManagement?.newItem()"><Plus :size="17" />{{ view==='message-template'?'新增模板':'新增消息' }}</el-button><el-button v-if="view==='referrals'" type="primary" @click="openReferral"><Plus :size="17" />创建推荐码</el-button><el-button v-if="view==='exam-categories'" type="primary" @click="categoryNew()"><Plus :size="17" />新增分类</el-button><el-button v-if="view==='question-types' && questionTypesPage?.isList" type="primary" @click="questionTypesPage?.open()"><Plus :size="17"/>新建题型</el-button><el-button v-if="view==='exam-projects'" type="primary" @click="projectNew()"><Plus :size="17" />新增考试项目</el-button><el-button v-if="isContent && kind!=='course'" type="primary" @click="openEditor()"><Plus :size="17" />新增{{ labels[kind] }}</el-button><template v-if="view==='question'"><el-button aria-label="导入题库" @click="questionTransfer?.open('import')"><Upload :size="17"/>导入</el-button><el-button aria-label="导出题库" @click="questionTransfer?.open('export')"><Download :size="17"/>导出</el-button><el-button @click="bulkContentDialog=true">批量操作</el-button></template></div></div>
        <el-alert v-if="error" type="error" :closable="false" :title="error" show-icon class="form-error" />
        <div v-loading="busy" class="view-content">
          <ExamCategories ref="examCategories" v-if="view==='exam-categories'" />
          <ExamProjects ref="examProjects" v-else-if="view==='exam-projects'" />
          <KnowledgeGraph v-else-if="view==='knowledge-graph'" ref="knowledgeGraph" @edit="openEditor" @course="createNodeCourse" @courses="courseManagerNode=$event" @preview="contentPreview?.open($event)" />
          <StyleComponents v-else-if="view==='style-components'" />
          <AdministratorManagement ref="administratorManagement" v-if="view==='administrators'" :current-id="identity?.id" @session-reset="unauthorized" />
          <PermissionManagement v-else-if="view==='permissions'" :key="revision" :exams="exams" />
          <template v-else-if="view==='roles'"><el-table :data="rows"><el-table-column prop="name" label="角色名称" width="160" /><el-table-column prop="description" label="权限范围" min-width="260" /><el-table-column label="类型" width="120"><template #default><el-tag effect="plain">系统内置</el-tag></template></el-table-column></el-table></template>
          <template v-else-if="view==='dashboard'&&dashboard">
            <div class="metric-strip"><article><span>注册学生</span><strong>{{ dashboard.counts.users.toLocaleString() }}<small>人</small></strong><span class="metric-detail">独立账号，按考试记录权益</span><Users class="metric-icon" :size="23" /></article><article><span>题库内容</span><strong>{{ dashboard.counts.questions.toLocaleString() }}<small>题</small></strong><span class="metric-detail">{{ dashboard.counts.knowledge }} 个知识点</span><BookOpen class="metric-icon teal" :size="23" /></article><article><span>模拟支付金额</span><strong>{{ money(dashboard.counts.paid_cents/100) }}</strong><span class="metric-detail">{{ dashboard.counts.orders }} 笔测试订单 · 未实际扣款</span><CreditCard class="metric-icon amber" :size="23" /></article><article><span>AI 累计估算费用</span><strong>{{ money(dashboard.counts.ai_cost) }}</strong><span class="metric-detail">含测试调用，以中转账单为准</span><Sparkles class="metric-icon violet" :size="23" /></article></div>
            <div class="dashboard-grid"><section class="section-band"><div class="section-title"><h2>内容资源</h2><button class="text-button" @click="navigate('question')">管理题库<ArrowUpRight :size="16" /></button></div><div class="resource-list"><div v-for="item in dashboard.content" :key="item.kind"><span>{{ labels[item.kind]||item.kind }}</span><div class="resource-track"><span :style="{width:Math.max(3,item.count/Math.max(...dashboard.content.map((x:any)=>x.count))*100)+'%'}"></span></div><strong>{{ item.count }}</strong></div></div></section><section class="section-band"><div class="section-title"><h2>待办与快捷入口</h2></div><button class="quick-row" @click="navigate('question')"><span class="quick-icon"><ClipboardList :size="21" /></span><span><strong>待审核内容</strong><small>{{ dashboard.counts.drafts }} 条草稿待完善</small></span><ChevronRight :size="18" /></button><button class="quick-row" @click="navigate('ai')"><span class="quick-icon green"><Sparkles :size="21" /></span><span><strong>AI 服务配置</strong><small>10 个功能点独立配置</small></span><ChevronRight :size="18" /></button><button class="quick-row" @click="navigate('exams')"><span class="quick-icon gold"><CalendarDays :size="21" /></span><span><strong>考试日期</strong><small>初级、中级 · 暂定 5 月 31 日</small></span><ChevronRight :size="18" /></button></section></div>
            <section class="section-band activity-section"><div class="section-title"><h2>最近操作</h2><button class="text-button" @click="navigate('audit')">全部日志<ArrowUpRight :size="16" /></button></div><el-table :data="dashboard.recent" empty-text="暂无操作记录"><el-table-column label="操作" min-width="200"><template #default="{row}">{{auditActionLabel(row.action)}}</template></el-table-column><el-table-column label="时间" width="205"><template #default="{row}">{{ formatDate(row.created_at) }}</template></el-table-column></el-table></section>
          </template>
          <template v-else-if="view==='ai'">
            <div class="ai-overview"><div><span class="subtle-label">功能启用</span><strong>{{ aiFeatures.filter(x=>x.enabled).length }}<small>/ {{ aiFeatures.length }}</small></strong></div><div><span class="subtle-label">真实接口</span><strong>{{ aiFeatures.filter(x=>x.config.mode==='live').length }}<small>个功能</small></strong></div><div class="ai-note"><ShieldCheck :size="20" /><span>密钥加密保存，仅服务端调用<br /><small>价格单位：人民币 / 百万 Token</small></span></div></div>
            <div class="table-toolbar"><h2>功能与模型</h2><span class="subtle-label">默认关闭，配置后按需启用</span></div>
            <el-table :data="aiFeatures" row-key="id"><el-table-column label="功能点" min-width="160"><template #default="{row}"><button class="table-title" @click="openUsage(row)">{{ row.name }}</button></template></el-table-column><el-table-column label="服务与模型" min-width="200"><template #default="{row}"><span>{{ row.config.model }}</span><small class="cell-sub">{{ row.config.provider }}</small></template></el-table-column><el-table-column label="运行模式" width="115"><template #default="{row}"><el-tag :type="row.config.mode==='live'?'success':'info'" effect="plain">{{ row.config.mode==='live'?'真实接口':'本地测试' }}</el-tag></template></el-table-column><el-table-column label="启用" width="90"><template #default="{row}"><el-switch :model-value="row.enabled" :aria-label="'启用'+row.name" @change="toggleAI(row,$event)" /></template></el-table-column><el-table-column label="操作" min-width="225"><template #default="{row}"><div class="row-actions"><el-button link type="primary" @click="configure(row)"><Settings2 :size="15" />配置</el-button><el-button link type="primary" :loading="testing===row.id" @click="testAI(row)">测试连接</el-button><el-button link type="primary" @click="openUsage(row)">用量</el-button></div><small v-if="aiTest[row.id]" class="cell-sub">{{ aiTest[row.id].status==='success'?'最近测试成功':'最近测试失败' }} · {{ aiTest[row.id].durationMs }}ms</small></template></el-table-column></el-table>
          </template>
          <MessageManagement ref="messageManagement" v-else-if="view==='message-template'||view==='message-center'" :key="view+revision" :mode="view==='message-template'?'templates':'messages'" />
          <ReferralManagement ref="referralManagement" v-else-if="view==='referrals'" :key="view+revision" />
          <SystemSettings v-else-if="view==='settings'" :key="view+revision+settingsSection" :initial-section="settingsSection" @basic-published="loadBrand" />
          <QuestionTypes ref="questionTypesPage" v-else-if="view==='question-types'" :exams="exams"/>
          <QuestionList ref="questionList" v-else-if="view==='question'" :exams="exams" @edit="openEditor"/>
          <ProductManagement ref="productManagement" v-else-if="view==='products'"/>
          <CourseManagement ref="courseManagement" v-else-if="view==='course'" :exams="exams" @edit="openEditor"/>
          <ResourceManagement ref="resourceManagement" v-else-if="view==='media'" @locate="locateResource"/>
          <CheatsheetManagement ref="cheatsheetManagement" v-else-if="view==='cheatsheet'" :exams="exams" @edit="openEditor"/>
          <ArticleManagement ref="articleManagement" v-else-if="view==='articles'"/>
          <template v-else-if="pendingPage">
            <el-empty description="等待开发" class="pending-page" :image-size="96" />
          </template>
          <template v-else-if="isContent">
            <div class="table-toolbar"><el-radio-group v-if="view==='knowledge'" v-model="treeKind"><el-radio-button value="subject">科目</el-radio-button><el-radio-button value="chapter">章</el-radio-button><el-radio-button value="section">节</el-radio-button><el-radio-button value="knowledge">知识点</el-radio-button></el-radio-group><span v-else class="table-count">全部{{ labels[kind] }} <b>{{ total }}</b></span><div class="filter-tools"><el-input v-model="search" clearable placeholder="搜索标题或唯一 ID" class="search-input" @keyup.enter="page=1;load()" @clear="page=1;load()"><template #prefix><Search :size="16" /></template></el-input><el-button v-if="view==='question'" @click="questionTransfer?.open('import')" ><Upload :size="16" />导入题库</el-button><el-button v-if="view==='question'" @click="questionTransfer?.open('export')"><Download :size="16"/>导出题库</el-button><el-button aria-label="执行搜索" @click="page=1;load()"><Search :size="16" /></el-button></div></div>
            <ContentTable :rows="rows" :exams="exams" @edit="openEditor"/>
            <div class="pagination"><span>共 {{ total }} 条内容</span><el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="prev,pager,next" /></div>
          </template>
          <template v-else-if="view==='exams'"><div class="table-toolbar"><h2>考期与学习计划规则</h2><span class="subtle-label">北京时间 · 结束时间变更将影响会员有效期</span></div><el-table :data="rows"><el-table-column prop="name" label="考试名称" min-width="180" /><el-table-column prop="year" label="考试年度" width="140" /><el-table-column label="考试结束时间" min-width="220"><template #default="{row}">{{ formatDate(row.ends_at) }}</template></el-table-column><el-table-column label="配置状态" width="150"><template #default><el-tag type="warning" effect="plain">暂定日期</el-tag></template></el-table-column><el-table-column label="操作" width="190"><template #default="{row}"><el-button link type="primary" @click="openDate(row)"><Pencil :size="15" />日期</el-button><el-button link type="primary" @click="openPlanConfig(row)"><SlidersHorizontal :size="15" />计划规则</el-button></template></el-table-column></el-table></template>
          <UserManagement ref="userManagement" v-else-if="view==='users'" @rights="entitlementUser=$event"/>
          <OrderManagement ref="orderManagement" v-else-if="view==='orders'"/>
          <LearningData ref="learningData" v-else-if="view==='records'"/>
          <AuditManagement ref="auditManagement" v-else-if="view==='audit'"/>
          <DataDictionary ref="dataDictionary" v-else-if="view==='data-dictionary'"/>
        </div>
      </main>
    </div>
    <QuestionEditor ref="questionEditor" :exams="exams" @saved="load"/>
    <CourseEditor ref="courseEditor" @saved="courseSaved"/>
    <el-drawer :model-value="!!courseManagerNode" :title="courseManagerNode?.kind==='section'?'精品课管理':'配套课管理'" size="720px" @close="courseManagerNode=null"><NodeCourses v-if="courseManagerNode" :key="courseManagerNode.id+'-'+courseManagerVersion" :node="courseManagerNode" @edit="openEditor"/></el-drawer>
    <el-dialog v-model="bulkContentDialog" title="批量操作" width="min(1200px,96vw)" class="bulk-content-dialog" align-center :close-on-click-modal="false" :close-on-press-escape="!bulkContentBusy" :before-close="(done:()=>void)=>{if(!bulkContentBusy)done()}" destroy-on-close><BulkContentManager :module="view==='knowledge-graph'?'knowledge':view==='articles'?'articles':view==='question'?'question':view==='course'?'course':'cheatsheet'" :exams="exams" :exam-id="view==='knowledge-graph'?knowledgeGraph?.selectedExamId:undefined" @busy-change="bulkContentBusy=$event" @changed="load" @edit="openEditor"/></el-dialog><ImportWizard ref="importHistory" :exams="exams" @saved="load"/><QuestionTransfer ref="questionTransfer" :exams="exams" @saved="load"/>
    <UserEntitlements :user="entitlementUser" :exams="exams" @close="entitlementUser=null" />
  </div>

  <el-drawer v-model="editor" :title="(edit.version?'编辑':'新增')+(labels[edit.kind]||'内容')" size="680px" class="editor-drawer" :close-on-click-modal="false">
    <el-form label-position="top" class="editor-form">
      <RecordIdentifier v-if="edit.version" :id="edit.id" :table="['subject','chapter','section','knowledge'].includes(edit.kind)?'knowledge_nodes':edit.kind==='question'?'questions':edit.kind==='course'?undefined:'other_content'"/>
      <el-form-item label="标题" required><el-input v-model="edit.title" type="textarea" :rows="2" maxlength="2000" /></el-form-item>
      <el-form-item v-if="edit.kind==='subject'" label="科目短标题"><el-input v-model="edit.payload.shortTitle" aria-label="科目短标题" maxlength="12" show-word-limit placeholder="如：综合能力、实务"/><span class="field-help">前端优先显示短标题，建议 2–6 个字；留空则显示完整标题。</span></el-form-item>
      <KnowledgeParentFields v-if="editor&&['subject','chapter','section','knowledge'].includes(edit.kind)" :key="edit.id" :row="edit" :exams="exams" :options="contentOptions"/>
      <div class="form-columns"><el-form-item v-if="!['subject','chapter','section','knowledge'].includes(edit.kind)" label="所属考试"><el-select v-model="edit.exam_id" :disabled="Boolean(edit.version) || edit.kind==='course'" clearable @change="changeContentExam" @clear="edit.exam_id=null"><el-option v-for="e in exams" :key="e.id" :label="e.name" :value="e.id" /></el-select></el-form-item><el-form-item label="发布状态"><el-select v-model="edit.status"><el-option v-for="s in ['draft','review','published','offline']" :key="s" :label="labels[s]" :value="s" /></el-select></el-form-item><el-form-item v-if="['knowledge','chapter','section'].includes(edit.kind)" label="排序"><el-input-number v-model="edit.payload.no" :min="1" :max="999" /></el-form-item></div>
      <template v-if="edit.kind==='question'">
        <el-form-item label="题目等级"><el-select v-model="edit.grade" aria-label="题目等级" placeholder="未设置" clearable @clear="edit.grade=null"><el-option v-for="grade in ['A','B','C','D','E']" :key="grade" :label="grade+'级'" :value="grade"/></el-select></el-form-item>
        <el-form-item label="关联知识点" required><el-select v-model="edit.payload.knowledgePointIds" multiple filterable @change="questionAssociationChanged"><el-option v-for="p in parentOptions" :key="p.id" :label="pointLabel(p)" :value="p.id"/></el-select></el-form-item>
        <el-form-item label="主知识点" required><el-select v-model="edit.parent_id" filterable><el-option v-for="p in parentOptions.filter(p=>edit.payload.knowledgePointIds.includes(p.id))" :key="p.id" :label="pointLabel(p)" :value="p.id"/></el-select></el-form-item>
      </template>
      <el-form-item v-else-if="!['subject','chapter','section','knowledge','article','announcement','faq','cheatsheet'].includes(edit.kind)" :label="edit.kind==='course'?'所属节 / 知识点':'所属父级'" required><el-select v-model="edit.parent_id" :disabled="edit.kind==='course'&&!!edit.parent_id" filterable><el-option v-for="p in parentOptions" :key="p.id" :label="`${labels[p.kind]} · ${p.title}`" :value="p.id" /></el-select></el-form-item>
      <el-form-item v-if="edit.kind==='knowledge'" label="知识点星级"><el-rate v-model="edit.payload.stars" show-score /></el-form-item>
      <template v-if="edit.kind==='question'"><el-form-item label="题型"><el-radio-group v-model="edit.payload.type"><el-radio-button value="single">单选题</el-radio-button><el-radio-button value="multiple">多选题</el-radio-button><el-radio-button value="subjective">主观题</el-radio-button></el-radio-group></el-form-item><template v-if="edit.payload.type!=='subjective'"><el-form-item label="选项，每行一个，按 A、B、C 顺序" required><el-input v-model="optionText" type="textarea" :rows="5" /></el-form-item><el-form-item label="正确答案，例如 A 或 A,C" required><el-input v-model="answerText" /></el-form-item></template><template v-else><el-form-item label="参考答案" required><el-input v-model="edit.payload.referenceAnswer" type="textarea" :rows="4" /></el-form-item><el-form-item label="评分标准" required><el-input v-model="edit.payload.rubric" type="textarea" :rows="4" /></el-form-item><el-form-item label="满分" required><el-input-number v-model="edit.payload.maxScore" :min="1" :max="200" /></el-form-item></template><el-form-item label="答案解析"><el-input v-model="edit.payload.explanation" type="textarea" :rows="5" /></el-form-item><div class="form-columns"><el-form-item label="真题年份"><el-input v-model="edit.payload.year" placeholder="非真题留空" /></el-form-item><el-form-item label="真题标签"><el-switch :model-value="edit.payload.source==='真题'" @change="edit.payload.source=$event?'真题':''" /></el-form-item></div></template>
      <template v-else-if="edit.kind==='course'"><div class="form-columns"><el-form-item label="课程类型"><el-select v-model="edit.payload.type"><el-option label="图文" value="article" /><el-option label="视频" value="video" /><el-option label="音频" value="audio" /></el-select></el-form-item><el-form-item label="所需会员"><el-select v-model="edit.payload.requiredLevel"><el-option label="VIP" value="vip" /><el-option label="SVIP" value="svip" /></el-select></el-form-item></div><el-form-item label="课程介绍"><el-input v-model="edit.payload.intro" type="textarea" :rows="5" /></el-form-item><el-form-item label="媒体地址（HTTPS）"><el-input v-model="edit.payload.mediaUrl" /></el-form-item><el-form-item label="时长（分钟）"><el-input-number v-model="edit.payload.totalMinutes" :min="1" /></el-form-item></template>
      <template v-else-if="edit.kind==='handout'"><el-form-item label="版本号"><el-input-number v-model="edit.payload.version" :min="1" /></el-form-item><el-form-item label="下载地址（HTTPS）"><el-input v-model="edit.payload.downloadUrl" /></el-form-item></template>
      <template v-else-if="['knowledge','cheatsheet'].includes(edit.kind)">
        <template v-if="edit.kind==='cheatsheet'"><el-form-item label="简介" required><el-input v-model="edit.payload.intro" type="textarea" :rows="3" maxlength="500" /></el-form-item><div class="form-columns"><el-form-item label="开放时间" required><el-date-picker v-model="edit.payload.opensAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" /></el-form-item><el-form-item label="关闭时间" required><el-date-picker v-model="edit.payload.closesAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" /></el-form-item></div></template>
        <el-form-item label="图文正文"><RichEditor v-if="editor" :key="edit.id" v-model="edit.payload.document" :plain-text="edit.payload.content" :exam-id="edit.exam_id" :content-id="edit.id" :allow-handouts="edit.kind!=='knowledge'" @busy="resourceBusy=$event" /></el-form-item>
      </template>
      <el-form-item v-else-if="['subject','chapter','section'].includes(edit.kind)" label="正文（选填）"><RichEditor v-if="editor" :key="edit.id" v-model="edit.payload.document" :plain-text="edit.payload.content" :exam-id="edit.exam_id" :content-id="edit.id" :allow-media="false" :allow-images="true" :allow-handouts="false" @busy="resourceBusy=$event" /></el-form-item>
      <el-form-item v-else label="正文"><RichEditor v-if="editor" :key="edit.id" v-model="edit.payload.document" :plain-text="edit.payload.content" :content-id="edit.id" :allow-media="false" :allow-handouts="false" @busy="resourceBusy=$event"/></el-form-item>
      <el-form-item v-if="['section','knowledge'].includes(edit.kind)" :label="edit.kind==='section'?'精品课':'配套课'"><el-checkbox :model-value="nodeHasCourse" disabled :aria-label="edit.kind==='section'?'精品课':'配套课'">{{nodeHasCourse?'已添加':'未添加'}}</el-checkbox></el-form-item>
      <div class="form-columns"><el-form-item label="来源"><ContentOrigin :id="edit.id" :source="edit.source"/></el-form-item><el-form-item label="测试内容标记"><el-switch v-model="edit.is_test_data" /></el-form-item></div>
      <el-checkbox v-model="advanced" @change="payloadText=JSON.stringify(edit.payload,null,2)">高级结构字段</el-checkbox><el-input v-if="advanced" v-model="payloadText" class="json-field" type="textarea" :rows="12" />
      <el-alert v-if="editError" :title="editError" type="error" :closable="false" show-icon class="form-error" />
    </el-form><template #footer><el-button :disabled="resourceBusy||saving" @click="editor=false">取消</el-button><el-button v-if="['section','knowledge'].includes(edit.kind)" :disabled="resourceBusy" :loading="saving" @click="saveContent(true)"><Eye :size="16"/>保存并预览</el-button><el-button type="primary" :disabled="resourceBusy" :loading="saving" @click="saveContent()">保存内容</el-button></template>
  </el-drawer>
  <ContentPreview ref="contentPreview"/>
  <el-dialog v-model="dateDialog" title="修改考试日期" width="480px"><p class="dialog-context">{{ dateEdit.name }} · {{ dateEdit.year }} 年</p><el-form label-position="top"><el-form-item label="考试结束时间（北京时间）"><el-date-picker v-model="dateEdit.endsAt" type="datetime" format="YYYY-MM-DD HH:mm:ss" /></el-form-item></el-form><el-alert v-if="dateError" :title="dateError" type="error" :closable="false" /><template #footer><el-button @click="dateDialog=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveDate">保存日期</el-button></template></el-dialog>
  <el-dialog v-model="planDialog" title="学习计划默认规则" width="520px"><p class="dialog-context">{{ planEdit.name }} · 用户可在前台自行调整</p><el-form label-position="top"><div class="form-columns"><el-form-item label="备考阶段（天）"><el-input-number v-model="planEdit.prepDays" :min="1" :max="365" /></el-form-item><el-form-item label="冲刺阶段（天）"><el-input-number v-model="planEdit.sprintDays" :min="1" :max="90" /></el-form-item></div><div class="form-columns"><el-form-item label="默认每周休息天数"><el-input-number v-model="planEdit.defaultRestDays" :min="0" :max="3" /></el-form-item><el-form-item label="默认轮次"><el-select v-model="planEdit.defaultRound"><el-option label="第一轮 · 覆盖学习" value="coverage" /><el-option label="第二轮 · 巩固复习" value="consolidation" /></el-select></el-form-item></div><el-alert v-if="planError" :title="planError" type="error" :closable="false" show-icon /></el-form><template #footer><el-button @click="planDialog=false">取消</el-button><el-button type="primary" :loading="saving" @click="savePlanConfig">保存规则</el-button></template></el-dialog>
  <el-drawer v-model="aiDialog" :title="aiEdit.name+' · 接口配置'" size="660px" :close-on-click-modal="false" :show-close="!aiDiscovering&&!saving" :close-on-press-escape="!aiDiscovering&&!saving"><RecordIdentifier :id="aiEdit.id" table="ai_features"/><el-form v-if="aiEdit.config" label-position="top" :disabled="saving||aiDiscovering"><div class="form-columns"><el-form-item label="运行模式"><el-select v-model="aiEdit.config.mode" :disabled="aiEdit.id==='page-agent'"><el-option label="本地测试适配器" value="mock" /><el-option label="真实中转接口" value="live" /></el-select></el-form-item><el-form-item label="功能启用"><el-switch v-model="aiEdit.enabled" /></el-form-item></div><el-form-item label="服务商名称"><el-input v-model="aiEdit.config.provider" /></el-form-item><el-form-item label="API Base URL（包含 /v1）"><el-input v-model="aiEdit.config.baseUrl" placeholder="https://api.apikey.fun/v1" /></el-form-item><el-form-item label="接口协议"><el-radio-group v-model="aiEdit.config.protocol" :disabled="aiEdit.id==='page-agent'"><el-radio-button value="responses">Responses</el-radio-button><el-radio-button value="chat">Chat Completions</el-radio-button></el-radio-group></el-form-item><AIModelConnection :key="aiEditorKey" :edit="aiEdit" :disabled="saving" @busy="aiDiscovering=$event" @model="Object.assign(aiEdit.config,prices.find(p=>p.model===$event)||{})"/><h3 class="form-section-title">费用标准 <small>人民币 / 1M Tokens</small></h3><div class="form-columns three"><el-form-item label="输入单价"><el-input-number v-model="aiEdit.config.inputPrice" :min="0" :precision="4" :controls="false" /></el-form-item><el-form-item label="输出单价"><el-input-number v-model="aiEdit.config.outputPrice" :min="0" :precision="4" :controls="false" /></el-form-item><el-form-item label="缓存读取"><el-input-number v-model="aiEdit.config.cachedPrice" :min="0" :precision="4" :controls="false" /></el-form-item></div><h3 class="form-section-title">用量限制</h3><div class="form-columns three"><el-form-item label="每日次数 / 用户"><el-input-number v-model="aiEdit.config.dailyLimit" :min="1" :max="100000" :controls="false" /></el-form-item><el-form-item label="最大输出 Token"><el-input-number v-model="aiEdit.config.maxTokens" :min="32" :max="16000" :controls="false" /></el-form-item><el-form-item label="超时（秒）"><el-input-number v-model="aiEdit.config.timeoutSeconds" :min="5" :max="120" :controls="false" /></el-form-item></div><el-form-item label="系统提示词"><el-button v-if="aiEdit.id==='grading'" link type="primary" @click="aiEdit.config.prompt=defaultGradingPrompt">填入主观题判分提示词</el-button><el-input v-model="aiEdit.config.prompt" type="textarea" :rows="5" /></el-form-item><el-alert v-if="aiError" :title="aiError" type="error" :closable="false" show-icon /></el-form><template #footer><el-button :disabled="aiDiscovering||saving" @click="aiDialog=false">取消</el-button><el-button type="primary" :disabled="aiDiscovering" :loading="saving" @click="saveAI">保存配置</el-button></template></el-drawer>
  <el-drawer v-model="usageDialog" :title="usageFeature?.name+' · 每日调用详情'" size="90%"><RecordIdentifier :id="usageFeature?.id" table="ai_features"/><div class="usage-filter"><el-date-picker v-model="usageDay" value-format="YYYY-MM-DD" type="date" :clearable="false" /><span>北京时间</span><el-button :loading="usageLoading" @click="loadUsage"><RefreshCw :size="16" />刷新</el-button></div><div class="usage-metrics"><div><span>调用 / 成功</span><strong>{{ usage.summary.calls||0 }} / {{ usage.summary.successes||0 }}</strong></div><div><span>输入 / 输出 Token</span><strong>{{ tokenNumber(usage.summary.input_tokens||0) }} / {{ tokenNumber(usage.summary.output_tokens||0) }}</strong></div><div><span>估算费用</span><strong>¥{{ Number(usage.summary.cost||0).toFixed(6) }}</strong></div><div><span>测试 / 未知费用</span><strong>{{ usage.summary.tests||0 }} / {{ usage.summary.unpriced||0 }}</strong></div></div><el-table v-loading="usageLoading" :data="usage.rows" empty-text="当天尚无AI调用"><el-table-column label="时间" width="185"><template #default="{row}">{{ formatDate(row.created_at) }}</template></el-table-column><el-table-column label="接口 / 模型" min-width="250"><template #default="{row}"><span>{{ row.model }}</span><small class="cell-sub">{{ row.endpoint }}</small></template></el-table-column><el-table-column label="输入 / 输出 / 缓存" min-width="190"><template #default="{row}">{{ tokenNumber(row.input_tokens) }} / {{ tokenNumber(row.output_tokens) }} / {{ tokenNumber(row.cached_tokens) }}</template></el-table-column><el-table-column label="费用（元）" width="130"><template #default="{row}">{{ row.cost_yuan===null?'未知':Number(row.cost_yuan).toFixed(8) }}</template></el-table-column><el-table-column label="状态" width="100"><template #default="{row}"><el-tag :type="stateColor(row.status)">{{ labels[row.status] }}</el-tag></template></el-table-column><el-table-column label="类型" width="85"><template #default="{row}">{{ row.is_test?'测试':'业务' }}</template></el-table-column><el-table-column label="详情" width="80"><template #default="{row}"><el-button link type="primary" aria-label="查看调用详情" @click="inspect=row"><Eye :size="17" /></el-button></template></el-table-column></el-table></el-drawer>
  <el-dialog v-model="importDialog" title="导入题库" width="760px" :close-on-click-modal="false"><el-form label-position="top"><el-form-item label="所属考试"><el-select v-model="importExam" :disabled="Boolean(importPreview)"><el-option v-for="e in exams" :key="e.id" :label="e.name" :value="e.id" /></el-select></el-form-item><div class="import-actions"><el-button @click="downloadTemplate"><Download :size="16" />下载标准模板</el-button><label class="upload-label"><Upload :size="16" />选择 Excel<input type="file" accept=".xlsx" :disabled="importBusy" @change="uploadFile" /></label></div><el-progress v-if="importBusy" :percentage="50" :indeterminate="true" :show-text="false" /><el-alert v-if="importError" :title="importError" type="error" :closable="false" class="form-error" /><template v-if="importPreview"><div class="import-summary"><strong>{{ importPreview.rows.length }} 道有效题目</strong><span>{{ importPreview.errors.length }} 项错误</span><el-checkbox v-model="importTest">标记为测试内容</el-checkbox></div><el-table v-if="importPreview.errors.length" :data="importPreview.errors" max-height="250"><el-table-column prop="line" label="行" width="60" /><el-table-column prop="id" label="题目ID" width="180" /><el-table-column prop="message" label="错误原因" /></el-table><el-table :data="importPreview.rows.slice(0,10)" max-height="260"><el-table-column prop="line" label="行" width="60" /><el-table-column prop="payload.stem" label="题目预览" /><el-table-column prop="payload.knowledgePointId" label="知识点ID" width="160" /></el-table></template></el-form><template #footer><el-button @click="importDialog=false">取消</el-button><el-button type="primary" :loading="importBusy" :disabled="!importPreview||importPreview.errors.length>0" @click="commit">确认导入草稿</el-button></template></el-dialog>
  <el-dialog :model-value="Boolean(inspect)" title="记录详情" width="720px" @close="inspect=null"><RecordIdentifier :id="inspect?.id"/><pre class="record-json">{{ JSON.stringify(inspect,null,2) }}</pre></el-dialog>
</template>
<style scoped>
.editor-form .field-help { display:block; width:100%; margin-top:6px; color:var(--el-text-color-secondary); font-size:12px; line-height:1.7; }
.developer-user{font-weight:700;color:#d97706;margin-right:8px}
.sidebar{width:240px;background:#f7f9fc;border-right:1px solid var(--admin-border);font-family:"Microsoft YaHei UI","Microsoft YaHei","PingFang SC",system-ui,sans-serif}
.sidebar .brand{padding:26px 24px 24px;gap:12px;flex-shrink:0}
.sidebar .brand-icon{width:38px;height:38px;border-radius:12px;background:var(--primary)}
.sidebar .brand-icon.has-logo{background:transparent}
.sidebar .brand-icon img{display:block;width:100%;height:100%;object-fit:contain;border-radius:inherit}
.sidebar .brand strong{font-size:19px;font-weight:650;letter-spacing:.06em;color:var(--admin-text)}
.sidebar .brand small{display:block;margin-top:2px;font-size:11px;letter-spacing:.03em;color:var(--muted)}
.sidebar nav{padding:6px 12px 18px;scrollbar-width:thin;scrollbar-color:var(--admin-border) transparent}
.sidebar nav .nav-group{margin:0 0 6px;border-radius:12px;padding:2px 0;transition:background .2s ease}
.sidebar nav .nav-group.is-open{background:var(--surface)}
.sidebar nav .nav-group-toggle{justify-content:flex-start;gap:10px;height:46px;padding:0 10px;margin:0;color:var(--admin-text);border-radius:10px}
.sidebar nav .nav-group-toggle:hover{background:#edf1f7}
.sidebar nav .nav-group-label{font-size:15px;font-weight:600;letter-spacing:.01em;white-space:nowrap}
.sidebar nav .nav-group-icon{width:30px;height:30px;display:grid;place-items:center;flex-shrink:0;color:#63738c;border-radius:8px;transition:background .2s,color .2s}
.sidebar nav .is-open .nav-group-icon{background:#edf2ff;color:var(--primary)}
.sidebar nav .nav-chevron{margin-left:auto;color:#8490a2;flex-shrink:0;transition:transform .2s ease}
.sidebar nav .nav-chevron.rotated{transform:rotate(90deg)}
.sidebar nav .nav-children{margin:2px 8px 8px;padding:0;border:0}
.sidebar nav .nav-item{font-size:14px;font-weight:400;min-height:40px;height:auto;padding:9px 12px 9px 23px;gap:13px;margin:2px 0;border-radius:8px;line-height:1.6;color:#52627a;transition:background .18s,color .18s}
.sidebar nav .nav-item:hover{background:#f1f4f9;color:var(--admin-text)}
.sidebar nav .nav-item.active{background:#eaf0ff;color:#2b55c4;font-weight:600}
.sidebar nav .nav-item-dot{width:5px;height:5px;flex-shrink:0;border-radius:50%;background:#acb7c7}
.sidebar nav .nav-item.active .nav-item-dot{background:currentColor;box-shadow:0 0 0 3px #dbe5ff}
.sidebar .sidebar-foot{height:54px;flex-shrink:0;margin:0 20px;padding:0 4px;font-size:11px;gap:8px;border-color:var(--admin-border)}
.shell-main{width:calc(100% - 240px);margin-left:240px}
@media(max-width:1100px) and (min-width:769px){.sidebar{width:224px}.shell-main{width:calc(100% - 224px);margin-left:224px}}
@media(max-width:768px){.sidebar{width:240px;max-width:calc(100vw - 56px)}.shell-main{width:100%;margin-left:0}.sidebar .brand{padding-top:20px;padding-bottom:18px}.sidebar nav .nav-item{min-height:44px}}
.pending-page{min-height:320px;border:1px solid var(--admin-border);border-radius:var(--admin-radius);background:var(--el-fill-color-blank)}
.test-indicator.is-production{color:var(--el-color-success);background:var(--el-color-success-light-9)}
.article-category{display:flex;align-items:center;gap:12px;font-size:14px;color:var(--admin-text)}
.article-category .el-select{width:180px}
.form-columns.knowledge-meta {
  grid-template-columns: minmax(0, calc((100% - 32px) / 3)) max-content max-content;
  column-gap: 16px;
}
@media (max-width: 768px) {
  .form-columns.knowledge-meta { grid-template-columns: 1fr; }
}
</style>

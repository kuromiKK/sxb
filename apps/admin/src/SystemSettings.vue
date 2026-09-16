<script setup lang="ts">
import {computed,onMounted,reactive,ref} from 'vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import {Save,Send,History,CheckCircle2,Image as ImageIcon} from 'lucide-vue-next'
import {request,send} from './api'
import CoverImagePicker from './CoverImagePicker.vue'
import RichEditor from './RichEditor.vue'
import ProductDocument from './ProductDocument.vue'
import InterfaceSettings from './InterfaceSettings.vue'
import EnvironmentInfo from './EnvironmentInfo.vue'
import PlatformModeSettings from './PlatformModeSettings.vue'
const props=defineProps<{initialSection?:string}>()
const emit=defineEmits<{'basic-published':[]}>()
const environmentRevision=ref(0)
function environmentChanged(){environmentRevision.value++;emit('basic-published')}
const active=ref(['agreement','privacy'].includes(props.initialSection||'')?'protocols':props.initialSection||'basic'),protocolKind=ref(props.initialSection==='privacy'?'privacy':'agreement')
const preferences=reactive<Record<string,any>>({}),forms=reactive<Record<string,any>>({}),protocols=reactive<Record<string,any>>({}),documents=reactive<Record<string,any>>({})
const loading=ref(false),saving=ref(false),error=ref(''),uploads=reactive<Record<string,boolean>>({}),historyOpen=ref(false),history=ref<any[]>([]),historyVersion=ref<any>()
const labels:Record<string,string>={basic:'基本设置',interfaces:'接口配置',search:'搜索设置',protocols:'协议管理',customer:'客服设置',about:'关于平台',environment:'运行环境'}
const searchTypes=[{value:'knowledge',label:'知识点'},{value:'course',label:'精品课'},{value:'faq',label:'常见问题'}]
const busy=computed(()=>saving.value||Object.values(uploads).some(Boolean)),current=computed(()=>protocols[protocolKind.value])
const clone=(v:any)=>JSON.parse(JSON.stringify(v)),same=(a:any,b:any)=>JSON.stringify(a)===JSON.stringify(b)
const dirty=computed(()=>active.value==='protocols'?!same(documents[protocolKind.value],current.value?.draft_document):!same(forms[active.value],preferences[active.value]?.draft))
const unpublished=computed(()=>active.value==='protocols'?!same(current.value?.draft_document,current.value?.published_document):!same(preferences[active.value]?.draft,preferences[active.value]?.published))
const date=(v:string)=>v?new Date(v).toLocaleString('zh-CN',{hour12:false}):'—'
async function load(only?:string){loading.value=true;error.value='';try{const data=await request('/admin/site-settings');for(const r of data.preferences)if(!only||only===r.key){preferences[r.key]=r;forms[r.key]=clone(r.draft)}for(const r of data.protocols)if(!only||only===r.kind){protocols[r.kind]=r;documents[r.kind]=clone(r.draft_document)}}catch(e:any){error.value=e.message}finally{loading.value=false}}
async function save(){if(busy.value)return;error.value='';saving.value=true;const section=active.value,kind=protocolKind.value;try{if(section==='protocols')await send('/admin/site-settings/protocols/'+kind,{revision:current.value.draft_revision,document:documents[kind]},'PUT');else await send('/admin/site-settings/preferences/'+section,{revision:preferences[section].revision,value:forms[section]},'PUT');await load(section==='protocols'?kind:section);ElMessage.success('草稿已保存，发布后前端生效')}catch(e:any){error.value=e.message}finally{saving.value=false}}
async function publish(){if(busy.value||dirty.value)return;const section=active.value,kind=protocolKind.value;try{await ElMessageBox.confirm(section==='protocols'?`发布后生成 V${current.value.published_version+1}，用户下次登录需重新勾选确认。历史版本会保留。`:'发布后，前端将使用当前已保存的配置。','确认发布',{type:'warning',confirmButtonText:'确认发布',cancelButtonText:'取消',closeOnClickModal:false});saving.value=true;error.value='';await send(section==='protocols'?'/admin/site-settings/protocols/'+kind+'/publish':'/admin/site-settings/preferences/'+section+'/publish',{revision:section==='protocols'?current.value.draft_revision:preferences[section].revision});if(section==='basic')emit('basic-published');await load(section==='protocols'?kind:section);ElMessage.success('发布成功')}catch(e:any){if(e!=='cancel'&&e!=='close')error.value=e.message}finally{saving.value=false}}
async function showHistory(){try{history.value=await request('/admin/site-settings/protocols/'+protocolKind.value+'/versions');historyVersion.value=history.value[0];historyOpen.value=true}catch(e:any){error.value=e.message}}
function restore(){documents[protocolKind.value]=clone(historyVersion.value.document);historyOpen.value=false;ElMessage.success('历史内容已载入编辑器，请保存草稿后发布')}
onMounted(()=>load())
</script>
<template>
 <section class="site-settings" v-loading="loading">
  <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon/>
  <el-tabs v-model="active" class="settings-tabs"><el-tab-pane v-for="(label,key) in labels" :key="key" :label="label" :name="key" :disabled="busy"/></el-tabs>
  <InterfaceSettings v-if="active==='interfaces'"/>
  <template v-else-if="active==='environment'">
   <PlatformModeSettings @changed="environmentChanged"/>
   <EnvironmentInfo :key="environmentRevision"/>
  </template>
  <template v-else-if="preferences.basic">
   <div class="settings-section-heading"><div><h2>{{labels[active]}}</h2><p>{{active==='protocols'?'每份协议独立管理版本，发布后用户下次登录重新确认。':'先保存草稿，预览确认后再发布到用户端。'}}</p></div><el-tag :type="dirty||unpublished?'warning':'success'"><CheckCircle2 :size="13"/>{{dirty?'有未保存修改':unpublished?'草稿待发布':'与已发布内容一致'}}</el-tag></div>
   <div v-if="active==='protocols'" class="protocol-switch"><button v-for="p in protocols" :key="p.kind" :class="{selected:protocolKind===p.kind}" :disabled="busy" @click="protocolKind=p.kind"><span>{{p.title}}</span><small>当前发布 V{{p.published_version}} · {{date(p.published_at)}}</small></button></div>
   <div class="settings-layout">
    <section class="settings-form-card"><el-form label-position="top" :disabled="busy">
     <template v-if="active==='basic'">
      <el-form-item label="平台名称" required><el-input v-model="forms.basic.name" maxlength="30" show-word-limit/></el-form-item>
      <el-form-item label="前端访问域名" required><el-input v-model="forms.basic.siteDomain" placeholder="https://www.example.com"/><p class="field-help">推荐码链接使用此地址，请填写不带页面路径的完整域名。</p></el-form-item>
      <div class="settings-two-columns"><el-form-item label="平台 Logo"><CoverImagePicker v-model="forms.basic.logo" class="platform-logo-picker" content-id="site-settings-basic" :max-size-mb="5" :disabled="busy" @busy="uploads.logo=$event"/><p class="field-help">建议使用方形 PNG 图片，发布后显示于后台左上角、登录页和关于平台。</p></el-form-item><el-form-item label="浏览器图标"><CoverImagePicker v-model="forms.basic.favicon" class="favicon-picker" content-id="site-settings-basic" :max-size-mb="2" :disabled="busy" @busy="uploads.favicon=$event"/><p class="field-help">建议上传 64×64 或更大的方形图片。</p></el-form-item></div>
     </template>
     <template v-else-if="active==='customer'">
      <el-form-item label="客服名称" required><el-input v-model="forms.customer.name" maxlength="50"/></el-form-item>
      <el-form-item label="客服二维码"><CoverImagePicker v-model="forms.customer.qrCode" content-id="site-settings-customer" :max-size-mb="5" :disabled="busy" @busy="uploads.qr=$event"/><p class="field-help">上传真实客服二维码；未上传时前端显示联系信息或未配置提示。</p></el-form-item>
      <el-form-item label="联系方式"><el-input v-model="forms.customer.contact" maxlength="100" placeholder="微信号、客服电话或邮箱"/></el-form-item>
      <el-form-item label="服务时间"><el-input v-model="forms.customer.hours" maxlength="100" placeholder="例如：工作日 09:00—18:00"/></el-form-item>
      <el-form-item label="提示文字"><el-input v-model="forms.customer.description" type="textarea" :rows="3" maxlength="500" show-word-limit/></el-form-item>
     </template>
     <template v-else-if="active==='search'">
      <el-form-item label="前端搜索"><el-switch v-model="forms.search.enabled" active-text="开启" inactive-text="关闭"/></el-form-item>
      <el-form-item label="搜索框提示语" required><el-input v-model="forms.search.placeholder" maxlength="60"/></el-form-item>
      <el-form-item label="搜索内容"><el-checkbox-group v-model="forms.search.types"><el-checkbox v-for="t in searchTypes" :key="t.value" :value="t.value">{{t.label}}</el-checkbox></el-checkbox-group></el-form-item>
      <p class="field-help">搜索当前考试的已发布内容。配套课通过知识点详情访问，不单独进入搜索结果；常见问题包含当前考试与全站文章。</p>
     </template>
     <template v-else-if="active==='about'">
      <el-form-item label="运营主体"><el-input v-model="forms.about.operator" maxlength="100"/></el-form-item>
      <el-form-item label="平台介绍"><RichEditor v-model="forms.about.document" content-id="site-settings-about" :allow-media="false" :allow-handouts="false" @busy="uploads.about=$event"/></el-form-item>
      <el-form-item label="版权信息"><el-input v-model="forms.about.copyright" maxlength="200"/></el-form-item>
      <el-form-item label="备案信息"><el-input v-model="forms.about.filing" maxlength="100"/></el-form-item>
     </template>
     <template v-else-if="active==='protocols'&&current">
      <div class="protocol-editor-heading"><div><h3>{{current.title}}</h3><p>当前发布版本 <strong>V{{current.published_version}}</strong> · 草稿修订 {{current.draft_revision}}</p></div><el-button :disabled="busy" @click="showHistory"><History :size="16"/>版本历史</el-button></div>
      <el-form-item label="协议正文" required><RichEditor :key="protocolKind" v-model="documents[protocolKind]" :content-id="'site-protocol-'+protocolKind" :allow-media="false" :allow-handouts="false" @busy="uploads.protocol=$event"/></el-form-item>
     </template>
    </el-form></section>
    <aside class="settings-preview"><div class="preview-caption">前端展示预览<el-tag size="small" type="info">草稿</el-tag></div>
     <template v-if="active==='basic'"><div class="brand-preview"><img v-if="forms.basic.logo" :src="forms.basic.logo" alt="平台 Logo"/><span v-else class="brand-placeholder">{{forms.basic.name?.slice(0,1)||'上'}}</span><h3>{{forms.basic.name}}</h3><p>登录页 · 关于平台</p></div><div class="browser-preview"><img v-if="forms.basic.favicon" :src="forms.basic.favicon" alt="浏览器图标"/><ImageIcon v-else :size="16"/><span>{{forms.basic.name}}</span></div></template>
     <template v-else-if="active==='customer'"><div class="customer-preview"><img v-if="forms.customer.qrCode" :src="forms.customer.qrCode" alt="客服二维码"/><div v-else class="qr-placeholder"><ImageIcon :size="32"/><span>暂未配置客服二维码</span></div><h3>{{forms.customer.name}}</h3><p>{{forms.customer.description}}</p><strong>{{forms.customer.contact}}</strong><p>{{forms.customer.hours}}</p></div></template>
     <template v-else-if="active==='search'"><div class="search-preview-input">{{forms.search.placeholder}}</div><div class="search-preview-types"><el-tag v-for="t in searchTypes.filter(t=>forms.search.types.includes(t.value))" :key="t.value" effect="plain">{{t.label}}</el-tag></div><p class="field-help">{{forms.search.enabled?'按当前考试检索，标题优先匹配。':'搜索入口已关闭（发布后生效）。'}}</p></template>
     <template v-else-if="active==='about'"><h3>关于{{forms.basic.name}}</h3><ProductDocument :document="forms.about.document"/><p>{{forms.about.operator}}</p><small>{{forms.about.copyright}}<br/>{{forms.about.filing}}</small></template>
     <template v-else-if="active==='protocols'"><h3>{{current.title}}</h3><p class="field-help">{{dirty||unpublished?'发布后生成 V'+(current.published_version+1):'当前版本 V'+current.published_version}}</p><ProductDocument :document="documents[protocolKind]"/></template>
    </aside>
   </div>
   <div class="settings-savebar"><span>{{dirty?'修改尚未保存':unpublished?'已保存，等待发布':'前端使用已发布版本'}}<small v-if="active!=='protocols'">上次发布 {{date(preferences[active]?.published_at)}}</small></span><el-button :disabled="busy||!dirty" :loading="saving" @click="save"><Save :size="16"/>保存草稿</el-button><el-button type="primary" :disabled="busy||dirty||!unpublished" :loading="saving" @click="publish"><Send :size="16"/>{{active==='protocols'?'发布新版本':'发布配置'}}</el-button></div>
  </template>
 </section>
 <el-drawer v-model="historyOpen" title="协议版本历史" size="min(820px,96vw)" :close-on-click-modal="false" destroy-on-close><div class="protocol-history"><el-select v-model="historyVersion" value-key="version" aria-label="选择协议版本"><el-option v-for="v in history" :key="v.version" :label="'V'+v.version+' · '+date(v.published_at)" :value="v"/></el-select><p v-if="historyVersion" class="field-help">发布人：{{historyVersion.publisher||'原前端内容迁移'}} · V{{historyVersion.version}}</p><ProductDocument v-if="historyVersion" :document="historyVersion.document"/></div><template #footer><el-button @click="historyOpen=false">关闭</el-button><el-button type="primary" @click="restore">载入此版本为草稿</el-button></template></el-drawer>
</template>
<style scoped>
.platform-logo-picker :deep(.cover-image-preview){width:200px;height:auto;aspect-ratio:1;object-fit:contain}
.favicon-picker :deep(.cover-image-preview){width:64px;height:auto;aspect-ratio:1;object-fit:contain}
.integration-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;padding:12px 0}.integration-card{padding:24px;background:var(--el-bg-color);border:1px solid var(--admin-border);border-radius:12px}.integration-card>div{display:flex;align-items:center;justify-content:space-between;gap:16px}.integration-card h2{font-size:16px;margin:0;color:var(--admin-text)}.integration-card p{margin:16px 0 0;font-size:14px;line-height:1.7;color:var(--el-text-color-regular)}@media(max-width:640px){.integration-grid{grid-template-columns:1fr}}
.site-settings{padding-bottom:24px}.settings-tabs{margin-bottom:12px}.settings-section-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:12px 0 22px}.settings-section-heading h2{font-size:19px;margin:0 0 8px;color:var(--admin-text)}.settings-section-heading p,.field-help{color:var(--el-text-color-regular);font-size:13px;line-height:1.8;margin:6px 0 0}.settings-section-heading :deep(.el-tag__content){display:flex;gap:6px;align-items:center}.settings-layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:24px;align-items:start}.settings-form-card,.settings-preview{background:var(--el-bg-color);border:1px solid var(--admin-border);border-radius:12px;padding:26px;min-width:0}.settings-form-card :deep(.el-form-item){margin-bottom:24px}.settings-form-card :deep(.el-form-item__label){font-weight:600}.settings-form-card :deep(.rich-editor){width:100%}.settings-two-columns{display:grid;grid-template-columns:1fr 1fr;gap:24px}.settings-preview{padding:22px;position:sticky;top:18px;max-height:75vh;overflow:auto;overflow-wrap:anywhere}.preview-caption{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--el-text-color-regular);padding-bottom:18px;border-bottom:1px solid var(--admin-border);margin-bottom:22px}.settings-preview h3{font-size:18px;margin:14px 0}.settings-preview p,.settings-preview small{font-size:13px;line-height:1.8;color:var(--el-text-color-regular)}.brand-preview,.customer-preview{text-align:center}.brand-preview>img,.brand-placeholder{width:72px;height:72px;border-radius:16px;object-fit:contain}.brand-placeholder{display:inline-grid;place-items:center;background:var(--el-color-primary);color:white;font-size:30px}.browser-preview{display:flex;gap:10px;align-items:center;border:1px solid var(--admin-border);border-radius:8px;padding:12px;margin-top:30px;font-size:13px}.browser-preview img{width:18px;height:18px;object-fit:contain}.customer-preview>img{max-width:200px;width:100%;height:auto}.qr-placeholder{display:flex;min-height:170px;flex-direction:column;gap:18px;justify-content:center;align-items:center;color:var(--el-text-color-secondary);background:var(--el-fill-color-light);border-radius:10px;font-size:13px}.search-preview-input{padding:13px;border:1px solid var(--admin-border);border-radius:8px;color:var(--el-text-color-secondary);font-size:13px}.search-preview-types{display:flex;gap:8px;margin-top:18px;flex-wrap:wrap}.protocol-switch{display:flex;gap:16px;margin-bottom:22px}.protocol-switch button{flex:1;text-align:left;border:1px solid var(--admin-border);border-radius:10px;background:var(--el-bg-color);padding:18px 20px;cursor:pointer;color:var(--admin-text)}.protocol-switch button.selected{border-color:var(--el-color-primary);background:var(--el-color-primary-light-9)}.protocol-switch span{display:block;font-size:15px;font-weight:600}.protocol-switch small{display:block;margin-top:9px;color:var(--el-text-color-regular)}.protocol-editor-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:22px}.protocol-editor-heading h3{font-size:16px;margin:0}.protocol-editor-heading p{font-size:12px;color:var(--el-text-color-regular);margin-bottom:0}.settings-savebar{position:sticky;bottom:0;display:flex;align-items:center;gap:12px;background:var(--el-bg-color);border:1px solid var(--admin-border);border-radius:10px;padding:16px 22px;margin-top:24px;z-index:5;box-shadow:0 -4px 18px rgba(24,40,70,.04)}.settings-savebar>span{margin-right:auto;font-size:13px;color:var(--el-text-color-regular)}.settings-savebar small{display:block;margin-top:4px;font-size:12px;color:var(--el-text-color-secondary)}.protocol-history>.el-select{width:100%;margin-bottom:12px}.site-settings>.el-alert{margin-bottom:20px}@media(max-width:1100px){.settings-layout{grid-template-columns:minmax(0,1fr) 270px}.settings-two-columns{grid-template-columns:1fr}}@media(max-width:800px){.settings-layout{grid-template-columns:1fr}.settings-preview{position:static}.settings-section-heading{align-items:flex-start;flex-direction:column}.protocol-switch{flex-direction:column}.settings-savebar{flex-wrap:wrap}.settings-savebar>span{width:100%}.settings-form-card{padding:18px}}
</style>

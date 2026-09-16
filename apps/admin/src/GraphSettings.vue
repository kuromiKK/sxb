<script setup lang="ts">
import {computed,reactive,ref} from 'vue'
import {ElMessage} from 'element-plus'
import {Save,RotateCcw} from 'lucide-vue-next'
import KnowledgeRelation from './KnowledgeRelation.vue'
import KnowledgeMindMap from './KnowledgeMindMap.vue'
import {graphDefaults,graphPresets,graphSchema} from '../../shared/workspace-tools'
import {send} from './api'
const props=defineProps<{row:any}>(),emit=defineEmits<{saved:[]}>()
const form=reactive(graphSchema.parse(props.row.config)),busy=ref(false),error=ref(''),view=ref('relation')
const dirty=computed(()=>JSON.stringify(form)!==JSON.stringify(graphSchema.parse(props.row.config)))
const labels={exam:'考试项目',subject:'科目',chapter:'章',section:'节',knowledge:'知识点',course:'课程'}
const root={id:'preview-exam',type:'exam',title:'初级社会工作师',children:[{id:'preview-subject',type:'subject',title:'社会工作实务',children:[{id:'preview-chapter',type:'chapter',title:'社会工作的专业价值观',children:[]}]},{id:'preview-section',type:'section',title:'社会工作服务的目标与功能',children:[]},{id:'preview-knowledge',type:'knowledge',title:'促进服务对象恢复社会功能',questions:12},{id:'preview-course',type:'course',title:'本节精品课',mediaType:'video'}]}
const preview=computed(()=>({...form,canvasHeight:500}))
function preset(value:any){Object.assign(form,structuredClone(value))}
async function save(){const parsed=graphSchema.safeParse(form);if(!parsed.success){error.value=parsed.error.issues.map(i=>i.message).join('；');return}busy.value=true;error.value='';try{await send('/admin/integrations/g6',{revision:props.row.revision,config:parsed.data},'PUT');window.dispatchEvent(new CustomEvent('sxb-graph-settings',{detail:parsed.data}));emit('saved');ElMessage.success('G6 样式已保存，图谱与思维导图已应用')}catch(e:any){error.value=e.message}finally{busy.value=false}}
</script>
<template>
 <div class="graph-settings-layout">
  <el-form label-position="top" class="tool-form" :disabled="busy">
   <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon/>
   <div class="tool-section"><div><h3>图谱外观</h3><p>知识图谱与思维导图共用</p></div><el-tag effect="plain">本地渲染</el-tag></div>
   <el-form-item label="预设主题"><div class="graph-presets"><el-button v-for="p in graphPresets" :key="p.name" @click="preset(p.value)">{{p.name}}</el-button></div></el-form-item>
   <div class="graph-color-fields"><el-form-item v-for="(label,key) in labels" :key="key" :label="label+'颜色'"><el-color-picker v-model="form.colors[key]" :predefine="Object.values(graphDefaults.colors)"/><code>{{form.colors[key]}}</code></el-form-item></div>
   <el-form-item label="节点风格"><el-radio-group v-model="form.nodeStyle"><el-radio-button value="gradient">渐变</el-radio-button><el-radio-button value="soft">柔和</el-radio-button><el-radio-button value="outline">描边</el-radio-button></el-radio-group></el-form-item>
   <div class="tool-two"><el-form-item label="卡片圆角（px）"><el-input-number v-model="form.radius" :min="0" :max="24"/></el-form-item><el-form-item label="标题字号（px）"><el-input-number v-model="form.fontSize" :min="12" :max="18"/></el-form-item><el-form-item label="节点阴影"><el-switch v-model="form.shadow" aria-label="节点阴影"/></el-form-item><el-form-item label="过渡动画"><el-switch v-model="form.animation" aria-label="过渡动画"/></el-form-item></div>
   <div class="tool-section"><div><h3>连线与画布</h3><p>实时查看样式，保存后正式生效</p></div></div>
   <div class="tool-two"><el-form-item label="关系图连线"><el-select v-model="form.edgeType"><el-option label="直线" value="line"/><el-option label="曲线" value="cubic-horizontal"/><el-option label="折线" value="polyline"/></el-select></el-form-item><el-form-item label="思维导图连线"><el-select v-model="form.mindEdgeType"><el-option label="直线" value="line"/><el-option label="曲线" value="cubic-horizontal"/><el-option label="折线" value="polyline"/></el-select></el-form-item><el-form-item label="连线粗细（px）"><el-input-number v-model="form.edgeWidth" :min="1" :max="5" :step="0.5"/></el-form-item><el-form-item label="虚线"><el-switch v-model="form.edgeDashed" aria-label="虚线"/></el-form-item><el-form-item label="画布背景"><el-color-picker v-model="form.background"/></el-form-item><el-form-item label="点阵网格"><el-switch v-model="form.grid" aria-label="点阵网格"/></el-form-item></div>
   <el-form-item label="画布高度（px）"><el-input-number v-model="form.canvasHeight" :min="500" :max="1200" :step="50"/></el-form-item>
   <div class="tool-save"><el-button type="primary" :loading="busy" :disabled="!dirty" @click="save"><Save :size="16"/>保存配置</el-button><el-button @click="preset(graphDefaults)"><RotateCcw :size="15"/>恢复默认</el-button></div>
  </el-form>
  <aside class="graph-live-preview">
   <div class="graph-preview-heading"><div><h3>实时预览</h3><p>示例数据 · 正式画布高度 {{form.canvasHeight}} px</p></div><el-radio-group v-model="view"><el-radio-button value="relation">关系图</el-radio-button><el-radio-button value="mind">思维导图</el-radio-button></el-radio-group></div>
   <KnowledgeRelation v-if="view==='relation'" :root="root" :settings="preview"/>
   <KnowledgeMindMap v-else :root="root" :settings="preview"/>
   <p class="tool-help">G6 是本地绘图库，无需 API Key。可拖动、缩放或全屏检查效果；脑图分支使用上述主题色轮换。</p>
  </aside>
 </div>
</template>
<style scoped>
.graph-settings-layout{display:grid;grid-template-columns:370px minmax(0,1fr);gap:24px;align-items:start}.graph-color-fields{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}.graph-color-fields code{font-size:12px;color:var(--muted);margin-left:8px}.graph-presets{display:flex;gap:6px;flex-wrap:wrap}.graph-presets .el-button{margin:0;padding:9px}.graph-live-preview{min-width:0;position:sticky;top:20px}.graph-preview-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;flex-wrap:wrap}.graph-preview-heading h3{margin:0;font-size:17px}.graph-preview-heading p{font-size:12px;color:var(--muted);margin:8px 0 0}.graph-live-preview :deep(.kr-search){width:160px}.graph-live-preview :deep(.kr-toolbar){gap:8px;flex-wrap:wrap}.graph-live-preview :deep(.kr-help){display:none}.graph-live-preview :deep(.mm-actions){flex-wrap:wrap}.graph-live-preview :deep(.mm-actions .el-select){width:200px}@media(max-width:1250px){.graph-settings-layout{grid-template-columns:1fr}.graph-live-preview{position:static}}
</style>

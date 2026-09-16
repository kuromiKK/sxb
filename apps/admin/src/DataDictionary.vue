<script setup lang="ts">
import {computed,onMounted,reactive,ref} from 'vue'
import {Search,RotateCcw,BookOpen,ArrowUpRight,Database} from 'lucide-vue-next'
import {request} from './api'
const tables=ref<any[]>([]),summary=ref<any>({}),generatedAt=ref(''),busy=ref(false),error=ref(''),page=ref(1)
const filters=reactive({search:'',group:'',kind:''}),applied=reactive({...filters}),opened=ref(false),selectedId=ref(''),tab=ref('fields'),fieldSearch=ref('')
const groups=computed(()=>[...new Set(tables.value.map(t=>t.group))])
const selected=computed(()=>tables.value.find(t=>t.id===selectedId.value))
const normalize=(v:any)=>String(v||'').toLocaleLowerCase()
const matches=(c:any,s:string)=>normalize([c.name,c.label,c.description,c.jsonDescription].join(' ')).includes(s)
const filtered=computed(()=>{const term=normalize(applied.search.trim());return tables.value.filter(t=>(!applied.group||t.group===applied.group)&&(!applied.kind||t.kind===applied.kind)&&(!term||normalize([t.name,t.label,t.description,t.schema].join(' ')).includes(term)||t.columns.some((c:any)=>matches(c,term))))})
const fields=computed(()=>selected.value?.columns.filter((c:any)=>matches(c,normalize(fieldSearch.value.trim())))||[])
const relations=computed(()=>tables.value.flatMap(t=>t.constraints.filter((c:any)=>c.type==='f'&&(t.id===selectedId.value||c.target_schema+'.'+c.target_table===selectedId.value)).map((c:any)=>({...c,sourceId:t.id,sourceLabel:t.label,targetId:c.target_schema+'.'+c.target_table,targetLabel:tables.value.find(r=>r.id===c.target_schema+'.'+c.target_table)?.label||c.target_table}))))
const jsonFields=computed(()=>selected.value?.columns.filter((c:any)=>c.jsonDescription)||[])
const constraintNames:Record<string,string>={p:'主键',u:'唯一约束',f:'外键',c:'检查约束'}
let revision=0
async function load(){const rev=++revision;busy.value=true;error.value='';try{const data=await request('/admin/data-dictionary');if(rev===revision){tables.value=data.tables;summary.value=data.summary;generatedAt.value=data.generatedAt}}catch(e:any){if(rev===revision)error.value=e.message}finally{if(rev===revision)busy.value=false}}
function search(){Object.assign(applied,filters);page.value=1}
function reset(){Object.assign(filters,{search:'',group:'',kind:''});search()}
function open(id:string){selectedId.value=id;opened.value=true;tab.value='fields';fieldSearch.value=''}
function typeText(c:any){return c.type==='character varying'?'varchar'+(c.max_length?'('+c.max_length+')':''):c.type==='USER-DEFINED'?c.udt_name:c.type==='numeric'&&c.numeric_precision?`numeric(${c.numeric_precision},${c.numeric_scale})`:c.type}
onMounted(load);defineExpose({load})
</script>
<template>
 <section class="dictionary-page">
  <form class="admin-filters" @submit.prevent="search">
   <label class="admin-filter-field dictionary-search"><span>表或字段</span><el-input v-model="filters.search" aria-label="搜索表或字段" placeholder="搜索中文说明、表名或字段名" clearable/></label>
   <label class="admin-filter-field"><span>业务分组</span><el-select v-model="filters.group" aria-label="业务分组" :empty-values="[null,undefined]"><el-option label="全部分组" value=""/><el-option v-for="g in groups" :key="g" :label="g" :value="g"/></el-select></label>
   <label class="admin-filter-field"><span>对象类型</span><el-select v-model="filters.kind" aria-label="对象类型" :empty-values="[null,undefined]"><el-option label="全部类型" value=""/><el-option label="数据表" value="数据表"/><el-option label="视图" value="视图"/></el-select></label>
   <div class="admin-filter-actions"><el-button type="primary" native-type="submit"><Search :size="16"/>查询</el-button><el-button @click="reset"><RotateCcw :size="16"/>重置</el-button></div>
  </form>
  <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon/>
  <div class="table-toolbar"><span>数据结构 <b>{{filtered.length}}</b></span><span class="subtle-label">{{summary.tables||0}} 张表 · {{summary.views||0}} 个视图 · {{summary.columns||0}} 个字段</span></div>
  <el-table v-loading="busy" :data="filtered.slice((page-1)*20,page*20)" row-key="id"><template #empty><el-empty description="没有匹配的表或字段" :image-size="80"/></template>
   <el-table-column label="名称 / 表名" min-width="255"><template #default="{row}"><button class="table-title dictionary-title" @click="open(row.id)">{{row.label}}</button><small class="dictionary-code">{{row.id}}</small></template></el-table-column>
   <el-table-column prop="group" label="业务分组" width="125"/>
   <el-table-column label="类型" width="95"><template #default="{row}"><el-tag :type="row.kind==='视图'?'warning':'info'">{{row.kind}}</el-tag></template></el-table-column>
   <el-table-column prop="description" label="用途" min-width="340" show-overflow-tooltip/>
   <el-table-column label="字段数" width="85" align="right"><template #default="{row}">{{row.columns.length}}</template></el-table-column>
   <el-table-column label="操作" width="95" fixed="right"><template #default="{row}"><el-tooltip content="查看结构"><el-button link type="primary" :aria-label="'查看'+row.label+'结构'" @click="open(row.id)"><BookOpen :size="17"/></el-button></el-tooltip></template></el-table-column>
  </el-table>
  <div class="pagination"><span>共 {{filtered.length}} 项 · 仅展示结构</span><el-pagination v-model:current-page="page" :total="filtered.length" :page-size="20" layout="prev,pager,next"/></div>
 </section>
 <el-drawer v-model="opened" :title="selected?.label||'数据结构'" size="min(1120px,100vw)" :close-on-click-modal="false" class="dictionary-drawer">
  <template v-if="selected"><div class="dictionary-overview"><div class="dictionary-symbol"><Database :size="23"/></div><div><strong class="dictionary-code">{{selected.id}}</strong><p>{{selected.description}}</p></div><el-tag :type="selected.kind==='视图'?'warning':'info'">{{selected.kind}}</el-tag></div>
   <el-tabs v-model="tab"><el-tab-pane label="字段说明" name="fields"/><el-tab-pane :label="'关联关系（'+relations.length+'）'" name="relations"/><el-tab-pane label="约束与索引" name="constraints"/><el-tab-pane label="扩展内容说明" name="json"/></el-tabs>
   <template v-if="tab==='fields'"><el-input v-model="fieldSearch" class="field-search" aria-label="筛选当前表字段" placeholder="搜索当前表的字段或说明" clearable :prefix-icon="Search"/>
    <el-table :data="fields" row-key="name"><template #empty><el-empty description="没有匹配的字段" :image-size="70"/></template>
     <el-table-column label="字段 / 含义" min-width="215"><template #default="{row}"><strong>{{row.label}}</strong><small class="dictionary-code">{{row.name}}</small></template></el-table-column>
     <el-table-column label="数据类型" min-width="150"><template #default="{row}"><code>{{typeText(row)}}</code></template></el-table-column>
     <el-table-column label="可为空" width="85"><template #default="{row}">{{row.nullable?'是':'否'}}</template></el-table-column>
     <el-table-column label="约束" width="130"><template #default="{row}"><div class="field-tags"><el-tag v-if="row.primary" size="small">主键</el-tag><el-tag v-else-if="row.unique" size="small" type="info">唯一约束</el-tag><el-tag v-if="row.sensitive" size="small" type="warning">敏感字段</el-tag><span v-if="!row.primary&&!row.unique&&!row.sensitive">—</span></div></template></el-table-column>
     <el-table-column label="默认值" min-width="130" show-overflow-tooltip><template #default="{row}">{{row.default_value??'未设置'}}</template></el-table-column>
     <el-table-column label="业务说明" min-width="245"><template #default="{row}">{{row.description||row.jsonDescription||'—'}}</template></el-table-column>
    </el-table><p class="dictionary-footnote">“可为空”和约束来自实际数据库。联合唯一约束覆盖一组字段，不代表每个字段单独唯一；表单必填规则可能更严格。</p>
   </template>
   <template v-else-if="tab==='relations'"><el-table :data="relations" empty-text="此对象没有声明数据库外键"><el-table-column label="来源表" min-width="200"><template #default="{row}"><el-button link type="primary" @click="open(row.sourceId)">{{row.sourceLabel}}<ArrowUpRight :size="14"/></el-button><small class="dictionary-code">{{row.sourceId}}</small></template></el-table-column><el-table-column label="关联字段" min-width="160"><template #default="{row}">{{row.columns.join('、')}}</template></el-table-column><el-table-column label="引用表" min-width="200"><template #default="{row}"><el-button link type="primary" @click="open(row.targetId)">{{row.targetLabel}}<ArrowUpRight :size="14"/></el-button><small class="dictionary-code">{{row.targetId}}</small></template></el-table-column><el-table-column label="引用字段" min-width="160"><template #default="{row}">{{row.target_columns.join('、')}}</template></el-table-column></el-table><p class="dictionary-footnote">展示数据库声明的外键。视图、扩展内容或应用代码维护的关系，请结合用途和扩展内容说明查看。</p></template>
   <template v-else-if="tab==='constraints'"><h3 class="dictionary-heading">数据库约束</h3><el-table :data="selected.constraints" empty-text="未声明约束"><el-table-column label="类型" width="100"><template #default="{row}">{{constraintNames[row.type]}}</template></el-table-column><el-table-column prop="name" label="名称" min-width="220"/><el-table-column prop="definition" label="约束规则" min-width="400"/></el-table><h3 class="dictionary-heading">索引</h3><el-table :data="selected.indexes" empty-text="未声明索引"><el-table-column prop="name" label="名称" min-width="240"/><el-table-column label="类型" width="115"><template #default="{row}">{{row.primary?'主键索引':row.unique?'唯一索引':'普通索引'}}</template></el-table-column><el-table-column prop="definition" label="索引规则" min-width="400"/></el-table></template>
   <template v-else><el-empty v-if="!jsonFields.length" description="此表没有扩展内容字段" :image-size="80"/><article v-for="field in jsonFields" :key="field.name" class="json-note"><h3>{{field.label}} <code>{{field.name}}</code></h3><p>{{field.jsonDescription}}</p></article></template>
  </template><template #footer><el-button @click="opened=false">关闭</el-button></template>
 </el-drawer>
</template>
<style scoped>
.dictionary-page{min-width:0}.dictionary-search{flex:2 1 280px}.table-toolbar b{margin-left:6px}.dictionary-code{display:block;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;color:var(--el-text-color-secondary);overflow-wrap:anywhere;margin-top:5px}.dictionary-title{text-align:left}.dictionary-overview{display:flex;gap:16px;align-items:flex-start;padding:18px;background:var(--el-fill-color-light);border:1px solid var(--admin-border);border-radius:var(--admin-radius);margin-bottom:20px}.dictionary-symbol{display:grid;place-items:center;width:44px;height:44px;flex:none;border-radius:10px;background:var(--el-color-primary-light-9);color:var(--el-color-primary)}.dictionary-overview>div:nth-child(2){flex:1;min-width:0}.dictionary-overview strong{font-size:14px;color:var(--admin-text);margin-top:0}.dictionary-overview p,.json-note p{font-size:14px;line-height:1.8;margin:7px 0 0;color:var(--el-text-color-regular)}.field-search{max-width:400px;margin-bottom:16px}.field-tags{display:flex;flex-wrap:wrap;gap:5px}.dictionary-heading{font-size:15px;margin:24px 0 14px}.dictionary-footnote{font-size:13px;line-height:1.8;color:var(--el-text-color-secondary);margin-top:16px}.json-note{padding:20px;border:1px solid var(--admin-border);border-radius:var(--admin-radius);margin-bottom:14px}.json-note h3{font-size:15px;margin:0}.json-note code{font-size:12px;font-weight:400;margin-left:12px;color:var(--el-text-color-secondary)}.pagination{gap:16px;flex-wrap:wrap}.dictionary-drawer :deep(.cell){overflow-wrap:anywhere}@media(max-width:600px){.dictionary-overview{padding:14px;gap:10px}.dictionary-overview>.el-tag{display:none}.dictionary-symbol{width:36px;height:36px}.table-toolbar{align-items:flex-start}}
</style>

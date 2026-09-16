<script setup lang="ts">
import {onMounted,ref} from 'vue'
import {Server,Monitor,Smartphone,Database,RefreshCw,ExternalLink,Blocks} from 'lucide-vue-next'
import {request} from './api'
type Environment={checkedAt:string;runtime:{mode:string;system:string;architecture:string;node:string};groups:{key:string;title:string;items:{label:string;value:string}[]}[];projects:{name:string;purpose:string;version:string;repository:string}[]}
const data=ref<Environment>(),loading=ref(false),error=ref('')
const icons:Record<string,any>={admin:Monitor,student:Smartphone,api:Server,database:Database}
async function load(){
 if(loading.value)return
 loading.value=true;error.value=''
 try{data.value=await request('/admin/environment')}
 catch(e:any){error.value=e.message||'环境信息读取失败，请重试'}
 finally{loading.value=false}
}
onMounted(load)
</script>
<template>
 <section class="environment-card" aria-labelledby="environment-heading" :aria-busy="loading">
  <header class="environment-heading"><div><h2 id="environment-heading"><Server :size="20" aria-hidden="true"/>运行环境</h2><p>当前服务的环境与技术版本，部署后自动显示服务器信息。</p></div><el-button :loading="loading" :disabled="loading" aria-label="刷新运行环境" @click="load"><RefreshCw v-if="!loading" :size="16"/>刷新</el-button></header>
  <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon/>
  <div class="project-repository"><span>本项目仓库</span><a class="repository-link" href="https://github.com/kuromiKK/sxb" target="_blank" rel="noopener noreferrer" aria-label="打开本项目 GitHub 仓库（新窗口）"><span>https://github.com/kuromiKK/sxb</span><ExternalLink :size="14" aria-hidden="true"/></a></div>
  <el-skeleton v-if="loading&&!data" :rows="5" animated/>
  <template v-if="data">
   <div class="environment-runtime"><el-tag :type="data.runtime.mode==='生产模式'?'success':'info'" effect="plain">{{data.runtime.mode}}</el-tag><span>{{data.runtime.system}}</span><span>{{data.runtime.architecture}}</span><span>Node.js {{data.runtime.node}}</span></div>
   <div class="environment-grid"><article v-for="group in data.groups" :key="group.key" class="environment-group"><h3><component :is="icons[group.key]" :size="18" aria-hidden="true"/>{{group.title}}</h3><dl><div v-for="item in group.items" :key="item.label"><dt>{{item.label}}</dt><dd>{{item.value}}</dd></div></dl></article></div>
   <footer>读取于 {{new Date(data.checkedAt).toLocaleString('zh-CN',{hour12:false})}}<span>只读信息 · 无需保存</span></footer>
  </template>
 </section>
 <section v-if="data" class="environment-card projects-card" aria-labelledby="projects-heading">
  <header class="environment-heading"><div><h2 id="projects-heading"><Blocks :size="20" aria-hidden="true"/>主要第三方项目</h2><p>展示已接入的主要开源项目与 SDK。外部服务是否启用、是否接通，请在接口配置中查看和测试。</p></div><el-tag type="info" effect="plain">{{data.projects.length}} 个项目</el-tag></header>
  <el-table :data="data.projects" class="projects-table" row-key="name">
   <el-table-column prop="name" label="项目" min-width="175"/>
   <el-table-column prop="purpose" label="用途" min-width="260"/>
   <el-table-column prop="version" label="版本" min-width="230"/>
   <el-table-column label="项目仓库" min-width="320"><template #default="{row}"><a class="repository-link" :href="row.repository" target="_blank" rel="noopener noreferrer" :aria-label="'打开 '+row.name+' 的 GitHub 仓库（新窗口）'"><span>{{row.repository}}</span><ExternalLink :size="14" aria-hidden="true"/></a></template></el-table-column>
  </el-table>
 </section>
</template>
<style scoped>
.environment-card{margin-top:12px;padding:24px;border:1px solid var(--admin-border);border-radius:12px;background:var(--el-bg-color);color:var(--admin-text);min-width:0}
.projects-card{margin-top:24px}.repository-link{display:inline-flex;align-items:center;gap:6px;color:var(--el-color-primary);text-decoration:none;max-width:100%;font-size:13px}.repository-link span{overflow-wrap:anywhere}.repository-link svg{flex-shrink:0}.repository-link:hover span{text-decoration:underline}.repository-link:focus-visible{outline:2px solid var(--el-color-primary);outline-offset:3px}.projects-table :deep(.cell){line-height:1.7;padding-top:8px;padding-bottom:8px}
.environment-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:20px}.environment-heading h2{display:flex;align-items:center;gap:10px;margin:0;font-size:17px}.environment-heading p{margin:8px 0 0;color:var(--el-text-color-regular);font-size:13px;line-height:1.7}.environment-heading .el-button{gap:6px}
.environment-runtime{display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px;margin:18px 0 22px;font-size:13px;color:var(--el-text-color-regular)}
.project-repository{display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px;padding:14px 16px;margin-bottom:20px;border-radius:8px;background:var(--el-fill-color-light);font-size:13px;line-height:1.7}.project-repository>span{color:var(--el-text-color-regular)}
.environment-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.environment-group{min-width:0;padding:20px;border:1px solid var(--admin-border);border-radius:10px;background:var(--el-fill-color-blank)}.environment-group h3{display:flex;align-items:center;gap:9px;font-size:14px;margin:0 0 18px}.environment-group h3 svg{color:var(--el-color-primary)}
dl{display:grid;gap:12px;margin:0}dl>div{display:grid;grid-template-columns:90px minmax(0,1fr);gap:12px;font-size:13px;line-height:1.6}dt{color:var(--el-text-color-regular)}dd{margin:0;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
footer{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:18px;font-size:12px;color:var(--el-text-color-regular)}
@media(max-width:800px){.environment-grid{grid-template-columns:1fr}.environment-card{padding:18px}.environment-group{padding:16px}}
</style>

<script setup lang="ts">
import { RefreshCw, Plus, Pencil, Trash2, Upload, QrCode, List, Image as ImageIcon } from 'lucide-vue-next'
import {ref} from 'vue'
import RichEditor from './RichEditor.vue'
const drawer=ref(false),dialog=ref(false),imported=ref(false),choice=ref(''),richRef=ref<any>(null)
const formChoice=ref([]),formDate=ref(''),formValue=ref(''),selectedVar=ref('')
function feedback(v:string){choice.value=v}
function insertWildcard(v:string){richRef.value?.insertText(v)}
</script>
<template>
  <section class="component-gallery">
    <div class="gallery-intro"><h2>公共组件</h2><p>全站后台统一组件与业务变体预览</p></div>
    <div class="gallery-grid">
      <article class="component-card"><h3>页面头部</h3><div class="demo-head"><strong>页面标题</strong><span><el-button circle><RefreshCw :size="16"/></el-button><el-button type="primary"><Plus :size="16"/>新增</el-button></span></div></article>
      <article class="component-card"><h3>操作按钮</h3><div class="demo-row"><el-button link type="primary"><Pencil :size="16"/></el-button><el-button link type="danger"><Trash2 :size="16"/></el-button><el-button link type="primary"><QrCode :size="16"/></el-button></div></article>
      <article class="component-card"><h3>状态标签</h3><div class="demo-row"><el-tag type="success">启用</el-tag><el-tag type="info">停用</el-tag><el-tag type="warning">审核中</el-tag><el-tag type="danger">失败</el-tag></div></article>
      <article class="component-card"><h3>上传控件</h3><div class="upload-demo"><el-button><Upload :size="16"/>选择文件</el-button><span>支持 JPG、PNG，不超过 200MB</span></div></article>
      <article class="component-card"><h3>表单控件</h3><div class="demo-form"><el-input v-model="formValue" placeholder="请输入内容"/><el-select v-model="choice" placeholder="请选择" @change="feedback(choice)"><el-option label="选项一" value="1"/></el-select></div></article>
      <article class="component-card"><h3>反馈状态</h3><el-alert title="操作成功提示" type="success" show-icon :closable="false"/></article>
      <article class="component-card"><h3>多选选择器</h3><el-select v-model="formChoice" multiple collapse-tags placeholder="请选择项目" style="width:100%"><el-option label="项目一" value="1"/><el-option label="项目二" value="2"/></el-select></article>
      <article class="component-card"><h3>树形选择器</h3><el-tree-select v-model="choice" @change="feedback(choice)" :data="[{label:'考试',value:'exam',children:[{label:'科目',value:'subject'}]}]" placeholder="请选择层级" style="width:100%"/></article>
      <article class="component-card"><h3>日期与日期范围</h3><el-date-picker v-model="formDate" @change="feedback(formDate)" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" style="width:100%"/></article>
      <article class="component-card"><h3>数字输入与开关</h3><div class="demo-row"><el-input-number :min="0"/><el-switch/></div></article>
      <article class="component-card"><h3>确认弹窗</h3><el-button type="danger" @click="dialog=true">删除操作</el-button><span class="hint">统一二次确认</span></article>
      <article class="component-card"><h3>空状态与加载</h3><el-empty description="暂无数据" :image-size="60"/></article>
      <article class="component-card"><h3>分页</h3><el-pagination small background layout="prev, pager, next" :total="50"/></article>
      <article class="component-card"><h3>二维码展示</h3><div class="qr-placeholder"><QrCode :size="52"/><el-button size="small">保存二维码</el-button></div></article>
      <article class="component-card"><h3>三步步骤条</h3><el-steps :active="1" simple><el-step title="选择"/><el-step title="编辑"/><el-step title="确认"/></el-steps></article>
      <article class="component-card"><h3>详情信息块</h3><el-descriptions :column="2" border><el-descriptions-item label="状态">启用</el-descriptions-item><el-descriptions-item label="创建时间">今天</el-descriptions-item></el-descriptions></article>
      <article class="component-card"><h3>统计卡片</h3><div class="metric"><span>本周学习人数</span><strong>1,280</strong></div></article>
      <article class="component-card wide"><h3>文字列表（8 列表头）</h3><el-table :data="[{title:'学习计划已更新',exam:'初级社会工作师',status:'已发布',source:'系统',updated:'今天',type:'提醒',author:'系统',action:'编辑'}]" size="small"><el-table-column prop="title" label="标题"/><el-table-column prop="exam" label="考试"/><el-table-column prop="status" label="状态"/><el-table-column prop="source" label="数据来源"/><el-table-column prop="updated" label="更新时间"/><el-table-column prop="type" label="类型"/><el-table-column prop="author" label="发布人"/><el-table-column label="操作"><template #default="{row}"><el-button link type="primary" @click="feedback(row.action)">编辑</el-button></template></el-table-column></el-table></article>
      <article class="component-card"><h3>图片列表</h3><div class="image-list"><div v-for="n in 4" :key="n"><div class="image-placeholder"><ImageIcon :size="20"/></div><span>内容封面 {{n}}</span></div></div></article>
      <article class="component-card"><h3>编辑右侧抽屉</h3><el-button type="primary" @click="drawer=true"><Pencil :size="16"/>打开编辑</el-button><el-drawer v-model="drawer" title="编辑内容" size="420px"><el-input placeholder="编辑标题"/><template #footer><el-button @click="drawer=false">取消</el-button><el-button type="primary" @click="drawer=false;feedback('保存成功')">保存</el-button></template></el-drawer></article>
      <article class="component-card"><h3>弹窗效果</h3><el-button @click="dialog=true">打开弹窗</el-button><el-dialog v-model="dialog" title="确认操作" width="360px"><p>这是统一弹窗样式示例。</p><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="dialog=false;feedback('已确认')">确定</el-button></template></el-dialog></article>
      <article class="component-card wide"><h3>图文富文本编辑器</h3><RichEditor content-id="style-demo-rich" :allow-media="false" :allow-handouts="false"/><p class="hint">可直接编辑文字、表格和图片内容</p></article>
      <article class="component-card wide"><h3>媒体富文本编辑器</h3><RichEditor content-id="style-demo-media" exam-id="demo" :allow-media="true" :allow-handouts="true"/><p class="hint">可插入图片、视频、音频、讲义和链接</p></article>
      <article class="component-card wide"><h3>通配符富文本编辑器</h3><RichEditor ref="richRef" content-id="style-demo-vars" :allow-variables="true" :allow-media="false" :allow-handouts="false"/><div class="var-actions"><span class="var-label">插入通配符</span><el-select v-model="selectedVar" placeholder="选择通配符" size="small" style="width:180px"><el-option label="用户昵称" value="{{nickname}}"/><el-option label="考试名称" value="{{kaoshiname}}"/></el-select><el-button size="small" type="primary" :disabled="!selectedVar" @click="insertWildcard(selectedVar)">插入</el-button></div><p class="hint">点击按钮直接插入编辑器</p></article>
      <article class="component-card"><h3>导入内容</h3><el-button @click="imported=true"><Upload :size="16"/>选择文件</el-button><el-alert v-if="imported" title="已选择示例文件，可预览导入内容" type="success" :closable="false" show-icon class="import-feedback"/></article>
      <article class="component-card"><h3>按钮圆角与方角</h3><div class="demo-row"><el-button type="primary" round @click="feedback('圆角按钮')">圆角按钮</el-button><el-button type="primary" @click="feedback('方角按钮')">方角按钮</el-button></div></article>
      <article class="component-card"><h3>表单交互</h3><el-input v-model="formValue" placeholder="输入内容"/><el-select v-model="formChoice" multiple collapse-tags placeholder="多选项目" class="control-gap"><el-option label="项目一" value="1"/><el-option label="项目二" value="2"/></el-select><el-date-picker v-model="formDate" type="date" placeholder="选择日期" class="control-gap"/><p class="feedback">输入：{{formValue||'—'}}　多选：{{formChoice.join('、')||'—'}}　日期：{{formDate||'—'}}</p></article>
    </div>
  </section>
</template>
<style scoped>
.component-gallery{padding:4px 0 40px}.gallery-intro{margin-bottom:18px}.gallery-intro h2{margin:0;color:#1c2d42}.gallery-intro p{margin:6px 0;color:#8190a2;font-size:13px}.gallery-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.component-card{padding:20px;background:#fff;border:1px solid #e1e8f0;border-radius:10px}.component-card h3{margin:0 0 16px;font-size:14px;color:#53677e}.demo-head,.demo-row,.upload-demo,.demo-form{display:flex;align-items:center;gap:10px}.demo-head{justify-content:space-between}.upload-demo span{font-size:12px;color:#8190a2}.demo-form>*{flex:1}.wide{grid-column:1/-1}.text-list{margin:0;padding:0;list-style:none}.text-list li{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #edf1f5;color:#26354a}.text-list small{color:#8190a2}.image-list{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.image-placeholder{aspect-ratio:3/4;height:auto;border-radius:6px;background:#eef3fb;display:grid;place-items:center;color:#7c9bd6}.image-list span{display:block;margin-top:5px;font-size:12px;text-align:center}.var-actions{display:flex;align-items:center;gap:10px;margin-top:14px;padding:10px 12px;background:#f7f9fc;border:1px solid #e5ebf3;border-radius:8px}.var-label{font-size:13px;color:#53677e;white-space:nowrap}.var-actions :deep(.el-select){width:220px}.var-actions :deep(.el-button){min-width:72px}.var-actions + .hint{margin:8px 0 0;color:#8190a2;font-size:12px}.control-gap{display:block;margin-top:10px;width:100%}.hint{margin-left:10px;color:#8190a2;font-size:12px}.qr-placeholder{display:flex;align-items:center;gap:14px;padding:14px;background:#f7f9fc;border-radius:8px}.chart-demo{display:flex;align-items:center;gap:16px}.bars{display:flex;align-items:flex-end;height:70px;gap:8px}.bars i{display:block;width:14px;background:#3569e8;border-radius:3px 3px 0 0}.feedback{color:#3569e8;font-size:12px}.import-feedback{margin-top:10px}.metric{padding:14px 16px;background:#f7f9fc;border-radius:8px}.metric span{display:block;color:#8190a2;font-size:12px}.metric strong{display:block;margin-top:6px;font-size:24px;color:#1c2d42}@media(max-width:800px){.gallery-grid{grid-template-columns:1fr}}
</style>












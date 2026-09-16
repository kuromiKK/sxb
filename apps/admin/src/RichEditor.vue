<script setup lang="ts">
import { computed, ref, watch,onBeforeUnmount } from 'vue'
import { useEditor, EditorContent, VueNodeViewRenderer } from '@tiptap/vue-3'
import { Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import Image from '@tiptap/extension-image'
import { Bold, Italic, Heading2, List, ListOrdered, Undo2, Redo2, ImagePlus, Video, AudioLines, Paperclip } from 'lucide-vue-next'
import RichResource from './RichResource.vue'
import { send } from './api'
import { uploadResource, type ResourceKind } from './utils/upload-resource'
const props=withDefaults(defineProps<{modelValue?:any;plainText?:string;examId?:string;contentId:string;allowHandouts?:boolean;allowMedia?:boolean;allowImages?:boolean;allowVariables?:boolean}>(),{examId:'',allowMedia:true,allowImages:true,allowHandouts:true})
const resourceTools=computed(()=>[(props.allowImages?{kind:'image',name:'图片',icon:ImagePlus}:null),...(props.allowMedia===false?[]:[{kind:'video',name:'视频',icon:Video},{kind:'audio',name:'音频',icon:AudioLines}]),...(props.allowHandouts===false?[]:[{kind:'handout',name:'讲义',icon:Paperclip}])].filter(Boolean) as any)
const emit=defineEmits(['update:modelValue','busy'])
const resource=Node.create({name:'resource',group:'block',atom:true,draggable:true,addAttributes(){return {assetId:{default:''},kind:{default:'image'},title:{default:''},posterAssetId:{default:null}}},parseHTML(){return []},renderHTML({HTMLAttributes}){return ['figure',mergeAttributes(HTMLAttributes,{'data-resource':'true'})]},addNodeView(){return VueNodeViewRenderer(RichResource)}})
const editor=useEditor({extensions:[StarterKit.configure({link:false,codeBlock:false,orderedList:{HTMLAttributes:{}}}),Image,Table.configure({resizable:true}),TableRow,TableHeader,TableCell,resource],content:props.modelValue||{type:'doc',content:(props.plainText||'').split('\n').map(text=>({type:'paragraph',...(text?{content:[{type:'text',text}]}:{})}))},onCreate:({editor})=>emit('update:modelValue',editor.getJSON()),onUpdate:({editor})=>emit('update:modelValue',editor.getJSON()),editorProps:{attributes:{'aria-label':'图文正文编辑器',role:'textbox','aria-multiline':'true'}}})
const dialog=ref(false),kind=ref('image'),source=ref('upload'),title=ref(''),external=ref(''),error=ref(''),busy=ref(false),progress=ref(0)
watch(()=>props.modelValue,value=>{if(value?.type==='doc'&&editor.value&&JSON.stringify(value)!==JSON.stringify(editor.value.getJSON()))editor.value.commands.setContent(value,{emitUpdate:false})})
const file=ref<File>(),poster=ref<File>();let xhr:ReturnType<typeof uploadResource>|undefined
function open(k:string){kind.value=k;source.value='upload';title.value='';external.value='';file.value=undefined;poster.value=undefined;error.value='';dialog.value=true}
function selectFile(e:Event,isPoster=false){const f=(e.target as HTMLInputElement).files?.[0];if(isPoster)poster.value=f;else {file.value=f;if(f&&!title.value)title.value=f.name}}
async function upload(f:File,k:string){
  xhr=uploadResource(f,{examId:props.examId,contentId:props.contentId,kind:k as ResourceKind,onProgress:value=>progress.value=value})
  return xhr.promise
}
async function insert(){
  if(busy.value)return;error.value=''
  if(!props.examId&&kind.value!=='image'){error.value='请先选择考试';return}
  if(!title.value.trim()){error.value='请填写资源名称';return}
  busy.value=true;emit('busy',true);progress.value=0
  try {
    if(source.value==='upload'&&!file.value)throw new Error('请选择文件')
    if(kind.value==='image'&&source.value==='external') {if(!/^https:\/\/[^\s]+$/.test(external.value))throw new Error('图片链接必须使用HTTPS');editor.value?.chain().focus().setImage({src:external.value,alt:title.value}).run();dialog.value=false;return }
    if(kind.value==='image'&&!props.examId){const asset=await upload(file.value!,'image');editor.value?.chain().focus().setImage({src:'/api/message-images/'+asset.id,alt:title.value}).run();dialog.value=false;return}
    const asset=source.value==='upload'?await upload(file.value!,kind.value):await send('/admin/media/external',{examId:props.examId,contentId:props.contentId,kind:kind.value,filename:title.value,url:external.value})
    const cover=kind.value==='video'&&poster.value?await upload(poster.value,'image'):undefined
    editor.value?.chain().focus().insertContent([{type:'resource',attrs:{assetId:asset.id,kind:kind.value,title:title.value,posterAssetId:cover?.id||null}},{type:'paragraph'}]).run();dialog.value=false
  }catch(e:any){error.value=e.message}finally{busy.value=false;emit('busy',false);xhr=undefined}
}
onBeforeUnmount(()=>{xhr?.abort();editor.value?.destroy()})
defineExpose({ insertText: (value:string) => editor.value?.chain().focus().insertContent(value).run() })
</script>
<template>
  <div class="rich-editor" v-if="editor">
    <div class="rich-toolbar" role="toolbar" aria-label="正文格式">
      <button type="button" title="加粗" aria-label="加粗" :aria-pressed="editor.isActive('bold')" @click="editor.chain().focus().toggleBold().run()"><Bold :size="18" /></button>
      <button type="button" title="斜体" aria-label="斜体" :aria-pressed="editor.isActive('italic')" @click="editor.chain().focus().toggleItalic().run()"><Italic :size="18" /></button>
      <button type="button" title="二级标题" aria-label="二级标题" @click="editor.chain().focus().toggleHeading({level:2}).run()"><Heading2 :size="18" /></button>
      <button type="button" title="无序列表" aria-label="无序列表" @click="editor.chain().focus().toggleBulletList().run()"><List :size="18" /></button>
      <button type="button" title="有序列表" aria-label="有序列表" @click="editor.chain().focus().toggleOrderedList().run()"><ListOrdered :size="18" /></button>
      <button type="button" title="插入表格" aria-label="插入表格" @click="editor.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run()"><span class="table-glyph">▦</span></button>
      <button type="button" title="撤销" aria-label="撤销" :disabled="!editor.can().undo()" @click="editor.chain().focus().undo().run()"><Undo2 :size="18" /></button>
      <button type="button" title="重做" aria-label="重做" :disabled="!editor.can().redo()" @click="editor.chain().focus().redo().run()"><Redo2 :size="18" /></button>
      <button v-for="tool in resourceTools" :key="tool.kind" type="button" :title="'插入'+tool.name" :aria-label="'插入'+tool.name" @click="open(tool.kind)"><component :is="tool.icon" :size="18" /></button>
    </div>
    <EditorContent :editor="editor" />
    <el-dialog v-model="dialog" title="插入资源" width="min(520px,92vw)" append-to-body :close-on-click-modal="!busy" :show-close="!busy" :close-on-press-escape="!busy">
      <el-form label-position="top"><el-form-item label="资源名称" required><el-input v-model="title" maxlength="200" /></el-form-item><el-form-item label="资源来源"><el-radio-group v-model="source" :disabled="busy"><el-radio-button value="upload">上传文件</el-radio-button><el-radio-button value="external">HTTPS 外链</el-radio-button></el-radio-group></el-form-item>
      <el-form-item v-if="source==='upload'" label="文件（单个最大 200MB）" required><div class="resource-file-picker"><el-button :disabled="busy" @click="($refs.resourceInput as HTMLInputElement)?.click()"><Paperclip :size="16"/>选择文件</el-button><span v-if="file" class="resource-filename">{{file.name}}</span><input ref="resourceInput" :key="kind" class="visually-hidden" type="file" :aria-label="'选择'+kind+'文件'" :disabled="busy" :accept="kind==='image'?'image/png,image/jpeg,image/webp,image/gif':kind==='video'?'video/mp4,video/webm':kind==='audio'?'audio/*':'.pdf,.docx,.pptx'" @change="selectFile($event)" /></div></el-form-item>
      <el-form-item v-else label="外链地址" required><el-input v-model="external" placeholder="https://" /></el-form-item><el-form-item v-if="kind==='video'" label="视频封面（可选）"><div class="resource-file-picker"><el-button :disabled="busy" @click="($refs.posterInput as HTMLInputElement)?.click()"><ImagePlus :size="16"/>选择封面</el-button><span v-if="poster" class="resource-filename">{{poster.name}}</span><input ref="posterInput" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" aria-label="视频封面" :disabled="busy" @change="selectFile($event,true)" /></div></el-form-item>
      <el-progress v-if="busy&&source==='upload'" :percentage="progress" /><el-alert v-if="error" :title="error" type="error" :closable="false" show-icon /></el-form>
      <template #footer><el-button @click="busy?xhr?.abort():dialog=false">{{ busy?'取消上传':'取消' }}</el-button><el-button type="primary" :loading="busy" @click="insert">插入正文</el-button></template>
    </el-dialog>
  </div>
</template>
<style scoped>
.rich-editor :deep(.tiptap img){max-width:100%;height:auto}
.rich-editor{width:100%;border:1px solid #d8e0e9;border-radius:6px;overflow:hidden;background:white}.rich-toolbar{display:flex;flex-wrap:wrap;gap:4px;padding:8px;border-bottom:1px solid #e2e8f0;background:#f8fafc}.rich-toolbar button{display:grid;place-items:center;width:36px;height:36px;border:0;border-radius:4px;background:transparent;color:#475569;cursor:pointer;transition:background .15s}.rich-toolbar button:hover,.rich-toolbar button[aria-pressed=true]{background:#e7efff;color:#2563eb}.rich-toolbar button:focus-visible{outline:2px solid #2563eb;outline-offset:1px}.rich-toolbar button:disabled{opacity:.35;cursor:default}.table-glyph{font-size:20px;line-height:1}.rich-editor :deep(.tiptap){min-height:300px;padding:20px;font-size:16px;line-height:1.8;color:#26354a;overflow-wrap:anywhere}.rich-editor :deep(.tiptap:focus){outline:2px solid #93b4f4;outline-offset:-2px}.rich-editor :deep(.tiptap p){margin:8px 0}.rich-editor :deep(.tiptap h2){font-size:20px;margin:20px 0 8px}.rich-editor :deep(.tiptap ul),.rich-editor :deep(.tiptap ol){padding-left:24px}.rich-editor :deep(.tiptap blockquote){border-left:3px solid #b3c7ea;padding-left:16px;color:#53637b}.rich-editor :deep(.tiptap table){border-collapse:collapse;width:100%;margin:14px 0}.rich-editor :deep(.tiptap th),.rich-editor :deep(.tiptap td){border:1px solid #dbe3ed;padding:8px;text-align:left}.rich-editor :deep(.tiptap th){background:#f5f8fc;font-weight:700}
 .resource-file-picker{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.resource-file-picker .el-button{display:inline-flex;align-items:center;gap:6px}.resource-filename{color:#606266;font-size:14px;overflow-wrap:anywhere}.visually-hidden{position:absolute!important;width:1px;height:1px;opacity:0;pointer-events:none}
</style>

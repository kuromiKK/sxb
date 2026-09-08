<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent, VueNodeViewRenderer } from '@tiptap/vue-3'
import { Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Italic, Heading2, List, ListOrdered, Undo2, Redo2, ImagePlus, Video, AudioLines, Paperclip } from 'lucide-vue-next'
import RichResource from './RichResource.vue'
import { send } from './api'
const props=defineProps<{modelValue?:any;plainText?:string;examId:string;contentId:string;allowHandouts?:boolean}>()
const resourceTools=computed(()=>[{kind:'image',name:'图片',icon:ImagePlus},{kind:'video',name:'视频',icon:Video},{kind:'audio',name:'音频',icon:AudioLines},...(props.allowHandouts===false?[]:[{kind:'handout',name:'讲义',icon:Paperclip}])])
const emit=defineEmits(['update:modelValue','busy'])
const resource=Node.create({name:'resource',group:'block',atom:true,draggable:true,addAttributes(){return {assetId:{default:''},kind:{default:'image'},title:{default:''},posterAssetId:{default:null}}},parseHTML(){return []},renderHTML({HTMLAttributes}){return ['figure',mergeAttributes(HTMLAttributes,{'data-resource':'true'})]},addNodeView(){return VueNodeViewRenderer(RichResource)}})
const editor=useEditor({extensions:[StarterKit.configure({link:false,codeBlock:false,orderedList:{HTMLAttributes:{}}}),resource],content:props.modelValue||{type:'doc',content:(props.plainText||'').split('\n').map(text=>({type:'paragraph',...(text?{content:[{type:'text',text}]}:{})}))},onCreate:({editor})=>emit('update:modelValue',editor.getJSON()),onUpdate:({editor})=>emit('update:modelValue',editor.getJSON()),editorProps:{attributes:{'aria-label':'图文正文编辑器',role:'textbox','aria-multiline':'true'}}})
const dialog=ref(false),kind=ref('image'),source=ref('upload'),title=ref(''),external=ref(''),error=ref(''),busy=ref(false),progress=ref(0)
const file=ref<File>(),poster=ref<File>();let xhr:XMLHttpRequest|undefined
function open(k:string){kind.value=k;title.value='';external.value='';file.value=undefined;poster.value=undefined;error.value='';dialog.value=true}
function selectFile(e:Event,isPoster=false){const f=(e.target as HTMLInputElement).files?.[0];if(isPoster)poster.value=f;else {file.value=f;if(f&&!title.value)title.value=f.name}}
async function upload(f:File,k:string):Promise<any>{
  if(f.size>200*1024*1024)throw new Error('单个文件不能超过 200MB')
  return new Promise((resolve,reject)=>{xhr=new XMLHttpRequest();xhr.open('POST',`/api/admin/media/upload?${new URLSearchParams({examId:props.examId,contentId:props.contentId,kind:k})}`);xhr.setRequestHeader('Authorization','Bearer '+sessionStorage.getItem('sxb-admin-token'));xhr.upload.onprogress=e=>{if(e.lengthComputable)progress.value=Math.round(e.loaded/e.total*100)};xhr.onload=()=>{let data:any;try{data=JSON.parse(xhr!.responseText)}catch{return reject(new Error('服务器未返回有效结果'))}xhr!.status<300?resolve(data):reject(new Error(data.message||'上传失败'))};xhr.onerror=()=>reject(new Error('上传连接中断，请重试'));xhr.onabort=()=>reject(new Error('已取消上传'));const data=new FormData();data.append('file',f);xhr.send(data)})
}
async function insert(){
  if(busy.value)return;error.value=''
  if(!props.examId){error.value='请先选择考试';return}
  if(!title.value.trim()){error.value='请填写资源名称';return}
  busy.value=true;emit('busy',true);progress.value=0
  try {
    if(source.value==='upload'&&!file.value)throw new Error('请选择文件')
    const asset=source.value==='upload'?await upload(file.value!,kind.value):await send('/admin/media/external',{examId:props.examId,contentId:props.contentId,kind:kind.value,filename:title.value,url:external.value})
    const cover=kind.value==='video'&&poster.value?await upload(poster.value,'image'):undefined
    editor.value?.chain().focus().insertContent([{type:'resource',attrs:{assetId:asset.id,kind:kind.value,title:title.value,posterAssetId:cover?.id||null}},{type:'paragraph'}]).run();dialog.value=false
  }catch(e:any){error.value=e.message}finally{busy.value=false;emit('busy',false);xhr=undefined}
}
onBeforeUnmount(()=>{xhr?.abort();editor.value?.destroy()})
</script>
<template>
  <div class="rich-editor" v-if="editor">
    <div class="rich-toolbar" role="toolbar" aria-label="正文格式">
      <button type="button" title="加粗" aria-label="加粗" :aria-pressed="editor.isActive('bold')" @click="editor.chain().focus().toggleBold().run()"><Bold :size="18" /></button>
      <button type="button" title="斜体" aria-label="斜体" :aria-pressed="editor.isActive('italic')" @click="editor.chain().focus().toggleItalic().run()"><Italic :size="18" /></button>
      <button type="button" title="二级标题" aria-label="二级标题" @click="editor.chain().focus().toggleHeading({level:2}).run()"><Heading2 :size="18" /></button>
      <button type="button" title="无序列表" aria-label="无序列表" @click="editor.chain().focus().toggleBulletList().run()"><List :size="18" /></button>
      <button type="button" title="有序列表" aria-label="有序列表" @click="editor.chain().focus().toggleOrderedList().run()"><ListOrdered :size="18" /></button>
      <button type="button" title="撤销" aria-label="撤销" :disabled="!editor.can().undo()" @click="editor.chain().focus().undo().run()"><Undo2 :size="18" /></button>
      <button type="button" title="重做" aria-label="重做" :disabled="!editor.can().redo()" @click="editor.chain().focus().redo().run()"><Redo2 :size="18" /></button>
      <button v-for="tool in resourceTools" :key="tool.kind" type="button" :title="'插入'+tool.name" :aria-label="'插入'+tool.name" @click="open(tool.kind)"><component :is="tool.icon" :size="18" /></button>
    </div>
    <EditorContent :editor="editor" />
    <el-dialog v-model="dialog" title="插入资源" width="min(520px,92vw)" append-to-body :close-on-click-modal="!busy" :show-close="!busy" :close-on-press-escape="!busy">
      <el-form label-position="top"><el-form-item label="资源名称" required><el-input v-model="title" maxlength="200" /></el-form-item><el-form-item label="资源来源"><el-radio-group v-model="source" :disabled="busy"><el-radio-button value="upload">上传文件</el-radio-button><el-radio-button value="external">HTTPS 外链</el-radio-button></el-radio-group></el-form-item>
      <el-form-item v-if="source==='upload'" label="文件（单个最大 200MB）" required><input :key="kind" type="file" :aria-label="'选择'+kind+'文件'" :disabled="busy" :accept="kind==='image'?'image/png,image/jpeg,image/webp,image/gif':kind==='video'?'video/mp4,video/webm':kind==='audio'?'audio/*':'.pdf,.docx,.pptx'" @change="selectFile($event)" /></el-form-item>
      <el-form-item v-else label="外链地址" required><el-input v-model="external" placeholder="https://" /></el-form-item><el-form-item v-if="kind==='video'" label="视频封面（可选）"><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="视频封面" :disabled="busy" @change="selectFile($event,true)" /></el-form-item>
      <el-progress v-if="busy&&source==='upload'" :percentage="progress" /><el-alert v-if="error" :title="error" type="error" :closable="false" show-icon /></el-form>
      <template #footer><el-button @click="busy?xhr?.abort():dialog=false">{{ busy?'取消上传':'取消' }}</el-button><el-button type="primary" :loading="busy" @click="insert">插入正文</el-button></template>
    </el-dialog>
  </div>
</template>
<style scoped>
.rich-editor{width:100%;border:1px solid #d8e0e9;border-radius:6px;overflow:hidden;background:white}.rich-toolbar{display:flex;flex-wrap:wrap;gap:4px;padding:8px;border-bottom:1px solid #e2e8f0;background:#f8fafc}.rich-toolbar button{display:grid;place-items:center;width:36px;height:36px;border:0;border-radius:4px;background:transparent;color:#475569;cursor:pointer;transition:background .15s}.rich-toolbar button:hover,.rich-toolbar button[aria-pressed=true]{background:#e7efff;color:#2563eb}.rich-toolbar button:focus-visible{outline:2px solid #2563eb;outline-offset:1px}.rich-toolbar button:disabled{opacity:.35;cursor:default}.rich-editor :deep(.tiptap){min-height:300px;padding:20px;font-size:16px;line-height:1.8;color:#26354a;overflow-wrap:anywhere}.rich-editor :deep(.tiptap:focus){outline:2px solid #93b4f4;outline-offset:-2px}.rich-editor :deep(.tiptap p){margin:8px 0}.rich-editor :deep(.tiptap h2){font-size:20px;margin:20px 0 8px}.rich-editor :deep(.tiptap ul),.rich-editor :deep(.tiptap ol){padding-left:24px}.rich-editor :deep(.tiptap blockquote){border-left:3px solid #b3c7ea;padding-left:16px;color:#53637b}
</style>

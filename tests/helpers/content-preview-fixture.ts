import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {profileFixture} from './user-profile-fixture.ts'
export async function previewFixture(){
 const f=await profileFixture(),{db,exam,admin}=f
 const doc={type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'预览正文标题'}]},{type:'paragraph',content:[{type:'text',text:'这是尚未发布的图文正文，支持实际用户端排版。'}]},{type:'resource',attrs:{assetId:'preview-image',kind:'image',title:'预览图片'}}]}
 await db.query("UPDATE content SET title='预览知识点',status='draft',payload=$2 WHERE id=$1",['a-k',JSON.stringify({stars:4,document:doc})])
 await db.query("UPDATE content SET title='预览节',status='offline',payload=$2 WHERE id=$1",['a-t',JSON.stringify({no:1,content:'节正文预览，未发布也可检查。'})])
 for(const [id,parent,type] of [['preview-course','a-k','video'],['preview-section-course','a-t','article']])await db.query("INSERT INTO content(id,exam_id,kind,parent_id,title,status,payload) VALUES($1,$2,'course',$3,$4,'draft',$5)",[id,exam,parent,type==='video'?'预览配套视频课':'预览精品图文课',JSON.stringify(type==='video'?{type,intro:'关联课程简介',mediaAssetId:'preview-video',posterAssetId:'preview-poster',handouts:[{assetId:'preview-handout',title:'预览讲义'}]}:{type,content:'精品课图文正文',handouts:[]})])
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5z8AAAAASUVORK5CYII=','base64')
 for(const [id,owner,kind,mime,filename,n] of [['preview-image','a-k','image','image/png','正文图.png',1],['preview-poster','preview-course','image','image/png','封面.png',2],['preview-video','preview-course','video','video/mp4','课.mp4',3],['preview-handout','preview-course','handout','application/pdf','讲义.pdf',4],['preview-other','b-k','image','image/png','其他考试.png',5]] as const){
  const disk='00000000-0000-4000-8000-'+String(n).padStart(12,'0'),bytes=kind==='image'?png:kind==='handout'?Buffer.from('%PDF-1.4\n%%EOF'):Buffer.from('preview-video-fixture')
  await writeFile(join(process.env.MEDIA_DIR!,disk),bytes)
  await db.query("INSERT INTO media_assets(id,exam_id,content_id,owner_id,kind,source,filename,mime,size_bytes,disk_name) VALUES($1,$2,$3,$4,$5,'upload',$6,$7,$8,$9)",[id,owner==='b-k'?f.second:exam,owner,admin.id,kind,filename,mime,bytes.length,disk])
 }
 async function create(id:string,auth=f.token){const r=await fetch(f.origin+'/api/admin/content-preview/'+id,{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:'{}'});return {status:r.status,data:await r.json() as any}}
 return {...f,create}
}

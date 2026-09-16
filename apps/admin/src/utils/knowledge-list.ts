export const nodeLabels:Record<string,string>={subject:'科目',chapter:'章',section:'节',knowledge:'知识点'}
export function titleWithoutPrefix(row:any){return String(row.title||'').replace(row.kind==='chapter'?/^第\s*[\d一二三四五六七八九十百零〇两]+\s*章[\s：:、.-]*/:row.kind==='section'?/^第\s*[\d一二三四五六七八九十百零〇两]+\s*节[\s：:、.-]*/:/^$^/,'')}
export function shortTitle(value:string){const chars=Array.from(value);return chars.length>50?chars.slice(0,50).join('')+'...':value}
export function buildKnowledgeRows(rows:any[],subjects:any[]){
  const byId=new Map<string,any>(rows.map(r=>[r.id,r]))
  const metadata=new Map<string,any>()
  subjects.forEach((s:any,si:number)=>{
    const sn=si+1
    metadata.set(s.id,{no:sn,path:String(sn),subjectId:s.id,childCount:s.chapters.length})
    s.chapters.forEach((c:any,ci:number)=>{
      const cn=ci+1
      metadata.set(c.id,{no:cn,path:`${sn}-${cn}`,subjectId:s.id,chapterId:c.id,childCount:c.sections.length})
      c.sections.forEach((t:any,ti:number)=>{
        const tn=ti+1,path=`${sn}-${cn}-${tn}`
        metadata.set(t.id,{no:tn,path,subjectId:s.id,chapterId:c.id,sectionId:t.id,childCount:t.knowledge.length,hasCourse:t.courses.length>0})
        t.knowledge.forEach((k:any)=>metadata.set(k.id,{path,subjectId:s.id,chapterId:c.id,sectionId:t.id,questionCount:k.questions,hasCourse:k.courses.length>0}))
      })
    })
  })
  return rows.filter(r=>nodeLabels[r.kind]).map(r=>{
    const meta=metadata.get(r.id)||{},parent=byId.get(r.parent_id),parentMeta=metadata.get(r.parent_id)
    const title=['chapter','section'].includes(r.kind)?`第${meta.no||1}${nodeLabels[r.kind]} ${titleWithoutPrefix(r)}`:r.title
    return {...r,...meta,displayTitle:title,parentTitle:parent?titleWithoutPrefix(parent):'—',parentPath:parentMeta?.path||'—'}
  })
}

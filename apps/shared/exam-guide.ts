export function hasExamGuide(doc:any):boolean {
  if(!doc||typeof doc!=='object')return false
  if(doc.type==='image')return !!doc.attrs?.src
  if(doc.type==='text')return !!doc.text?.trim()
  return Array.isArray(doc.content)&&doc.content.some(hasExamGuide)
}
export function currentExamTerm<T extends {year:number;cutoff?:string|null;startsAt?:string|null;endsAt?:string|null}>(terms:T[],now=new Date()):T|undefined {
  const active=terms.find(t=>t.startsAt&&t.endsAt&&Date.parse(t.startsAt)<=now.getTime()&&now.getTime()<Date.parse(t.endsAt))
  if(active)return active
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)
  return terms.filter(t=>t.cutoff&&t.cutoff>=today).sort((a,b)=>a.cutoff!.localeCompare(b.cutoff!))[0]||[...terms].sort((a,b)=>b.year-a.year)[0]
}

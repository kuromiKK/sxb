import 'dotenv/config'
import { readFile } from 'node:fs/promises'

const input=process.argv[2]
if(!input)throw new Error('Usage: node scripts/import-source-drafts.mjs path-to-reviewed-json')
if(process.env.APP_MODE==='production')throw new Error('Source draft loader is restricted to local testing')
const base=`http://127.0.0.1:${process.env.API_PORT||4310}/api`
let token=''
async function request(path,method='GET',body){
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)})
  const data=await response.json()
  if(!response.ok)throw new Error(`${path}: ${data.message}`)
  return data
}
token=(await request('/auth/admin','POST',{phone:process.env.ADMIN_PHONE,password:process.env.ADMIN_PASSWORD})).token
const source=JSON.parse(await readFile(input,'utf8'))
const existing=new Set()
for(let page=1;;page++){
  const data=await request(`/admin/content?page=${page}`)
  data.items.forEach(row=>existing.add(row.id))
  if(page*data.limit>=data.total)break
}
let added=0,skipped=0
for(const row of source.rows){
  if(existing.has(row.id)){skipped++;continue}
  await request('/admin/content/'+encodeURIComponent(row.id),'PUT',{...row,status:'draft'})
  added++
}
console.log(JSON.stringify({added,skipped,sourceIssues:source.issues?.length||0,status:'draft'},null,2))

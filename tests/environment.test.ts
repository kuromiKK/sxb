import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {profileFixture} from './helpers/user-profile-fixture.ts'

test('environment reports live database/runtime and separate frontend versions to admins only',async()=>{
 const f=await profileFixture()
 try{
  await f.call('/admin/environment',403,f.student)
  await f.call('/admin/environment',401,'invalid')
  const value=await f.call('/admin/environment')
  assert.equal(value.runtime.node,process.versions.node)
  assert.equal(value.runtime.mode,'测试模式')
  const group=(key:string)=>value.groups.find((g:any)=>g.key===key)
  const item=(key:string,label:string)=>group(key).items.find((i:any)=>i.label===label).value
  const actual=(await f.db.query("SELECT current_database() name, current_setting('server_version') version")).rows[0]
  assert.equal(item('database','数据库名称'),actual.name)
  assert.equal(item('database','数据库版本'),actual.version)
  assert.equal(item('database','数据库类型'),'PGlite（嵌入式 PostgreSQL）')
  const adminVue=JSON.parse(readFileSync(new URL('../node_modules/vue/package.json',import.meta.url),'utf8')).version
  const userVue=JSON.parse(readFileSync(new URL('../apps/user/node_modules/vue/package.json',import.meta.url),'utf8')).version
  assert.equal(item('admin','开发框架'),'Vue '+adminVue)
  assert.equal(item('student','视图框架'),'Vue '+userVue)
  const serialized=JSON.stringify(value)
  for(const secret of [process.env.SECRET_KEY,process.env.ADMIN_PASSWORD,process.env.LOCAL_DATABASE_DIR,process.env.MEDIA_DIR])assert(secret&&!serialized.includes(secret))
  assert(!serialized.includes('未检测到'))
  const response=await fetch(f.origin+'/api/admin/environment',{headers:{Authorization:'Bearer '+f.token}})
  assert.equal(response.headers.get('cache-control'),'no-store')
  const write=await fetch(f.origin+'/api/admin/environment',{method:'POST',headers:{Authorization:'Bearer '+f.token}})
  assert.equal(write.status,404)
 }finally{await f.close()}
})

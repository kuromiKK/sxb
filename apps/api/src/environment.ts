import {readFileSync} from 'node:fs'
import {arch,platform,release} from 'node:os'
import {Router} from 'express'
import {PGlite} from '@electric-sql/pglite'
import {database,db} from './db.ts'
import {platformEnvironment} from './platform-mode.ts'

const root=new URL('../../../',import.meta.url)
// Fixed allowlist only: never return environment variables, connection strings or paths.
function version(name:string,student=false):string {
 const base=new URL(student?'apps/user/':'./',root)
 try{return JSON.parse(readFileSync(new URL('node_modules/'+name+'/package.json',base),'utf8')).version}
 catch{
  try{
   const value=JSON.parse(readFileSync(new URL('package-lock.json',base),'utf8')).packages?.['node_modules/'+name]?.version
   if(value)return value+'（锁定版本）'
  }catch{}
  return '未检测到'
 }
}
export const environment=Router()
environment.get('/',async(_req,res)=>{
 const driver=await database()
 const result=await db.query('SELECT current_database() AS name, current_setting(\'server_version\') AS version')
 const databaseInfo=result.rows[0]
 const embedded=driver instanceof PGlite
 const system:Record<string,string>={win32:'Windows',linux:'Linux',darwin:'macOS'}
 res.set('Cache-Control','no-store').json({
  checkedAt:new Date().toISOString(),
  runtime:{mode:(await platformEnvironment()).mode==='production'?'生产模式':'测试模式',system:(system[platform()]||platform())+' '+release(),architecture:arch(),node:process.versions.node},
  projects:[
   {name:'AntV G6',purpose:'知识图谱的图形布局与交互展示',version:version('@antv/g6'),repository:'https://github.com/antvis/G6'},
   {name:'Page Agent',purpose:'AI 员工，通过自然语言操作后台页面',version:version('page-agent'),repository:'https://github.com/alibaba/page-agent'},
   {name:'GoCaptcha Service',purpose:'验证码挑战生成与服务端核验',version:'独立部署，版本未检测',repository:'https://github.com/wenlng/go-captcha-service'},
   {name:'GoCaptcha Vue',purpose:'后台验证码展示、交互与配置预览',version:version('go-captcha-vue'),repository:'https://github.com/wenlng/go-captcha-vue'},
   {name:'GoCaptcha Uni',purpose:'用户端 H5 与微信小程序验证码交互',version:version('go-captcha-uni',true),repository:'https://github.com/wenlng/go-captcha-uni'},
   {name:'Tiptap',purpose:'图文内容的所见即所得编辑器',version:version('@tiptap/vue-3'),repository:'https://github.com/ueberdosis/tiptap'},
   {name:'ExcelJS',purpose:'Excel 模板生成、数据导入与导出',version:version('exceljs'),repository:'https://github.com/exceljs/exceljs'},
   {name:'node-qrcode',purpose:'推荐码及预览链接的二维码生成',version:version('qrcode'),repository:'https://github.com/soldair/node-qrcode'},
   {name:'Lucide',purpose:'管理后台的界面图标',version:version('lucide-vue-next'),repository:'https://github.com/lucide-icons/lucide'},
   {name:'Vue',purpose:'管理后台及用户端的视图框架',version:version('vue')+'（后台） / '+version('vue',true)+'（用户端）',repository:'https://github.com/vuejs/core'},
   {name:'Element Plus',purpose:'管理后台的表格、表单、抽屉等基础组件',version:version('element-plus'),repository:'https://github.com/element-plus/element-plus'},
   {name:'uni-app',purpose:'用户端 H5 与微信小程序跨端开发',version:version('@dcloudio/uni-app',true),repository:'https://github.com/dcloudio/uni-app'},
   {name:'NestJS',purpose:'后端 API 应用框架',version:version('@nestjs/core'),repository:'https://github.com/nestjs/nest'},
   {name:'PGlite',purpose:'隔离的自动化测试使用的嵌入式数据库',version:version('@electric-sql/pglite'),repository:'https://github.com/electric-sql/pglite'},
   {name:'Alipay SDK',purpose:'支付宝支付接口对接',version:version('alipay-sdk'),repository:'https://github.com/alipay/alipay-sdk-nodejs-all'}
   ,{name:'阿里云短信 SDK',purpose:'阿里云短信发送与服务接口对接',version:version('@alicloud/dysmsapi20170525'),repository:'https://github.com/aliyun/alibabacloud-typescript-sdk'}
  ],
  groups:[
   {key:'admin',title:'管理后台',items:[{label:'开发框架',value:'Vue '+version('vue')},{label:'组件库',value:'Element Plus '+version('element-plus')},{label:'开发语言',value:'TypeScript '+version('typescript')+' / HTML / CSS'},{label:'构建工具',value:'Vite '+version('vite')}]},
   {key:'student',title:'用户前端',items:[{label:'开发框架',value:'uni-app '+version('@dcloudio/uni-app',true)},{label:'视图框架',value:'Vue '+version('vue',true)},{label:'开发语言',value:'TypeScript '+version('typescript',true)+' / HTML / CSS'},{label:'构建工具',value:'Vite '+version('vite',true)}]},
   {key:'api',title:'后端服务',items:[{label:'开发框架',value:'NestJS '+version('@nestjs/core')},{label:'HTTP 框架',value:'Express '+version('express')},{label:'开发语言',value:'TypeScript '+version('typescript')},{label:'运行时',value:'Node.js '+process.versions.node}]},
   {key:'database',title:'数据库',items:[{label:'数据库类型',value:embedded?'PGlite（嵌入式 PostgreSQL）':'PostgreSQL'},{label:'数据库名称',value:String(databaseInfo.name)},{label:'数据库版本',value:String(databaseInfo.version)},{label:embedded?'PGlite 版本':'连接驱动',value:embedded?version('@electric-sql/pglite'):'pg '+version('pg')}]}
  ]
 })
})

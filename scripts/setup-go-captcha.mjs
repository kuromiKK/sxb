import {mkdir,readFile,writeFile,access} from 'node:fs/promises'
import {createHash,randomBytes} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'

// Download only the pinned official release. Runtime files remain outside source control.
if(process.platform!=='win32'||process.arch!=='x64')throw Error('本脚本适用于 Windows x64；其他部署方式参见 docs/INTEGRATIONS.md')
const dir=fileURLToPath(new URL('../.local/go-captcha/',import.meta.url))
const digest='33181f89353f537e465dc9e34d2f6618f0fc39f97544d7bb2fae09383f80d054'
const archive=resolve(dir,'service.tar.gz'),exe=resolve(dir,'go-captcha-service-windows-amd64.exe')
await mkdir(dir,{recursive:true})
let bytes
try{bytes=await readFile(archive)}catch{
 const response=await fetch('https://github.com/wenlng/go-captcha-service/releases/download/v1.0.5/go-captcha-service-1.0.6-windows-amd64.tar.gz',{signal:AbortSignal.timeout(120000)})
 if(!response.ok)throw Error('GoCaptcha 下载失败：'+response.status)
 bytes=Buffer.from(await response.arrayBuffer())
 if(createHash('sha256').update(bytes).digest('hex')!==digest)throw Error('GoCaptcha 校验失败')
 await writeFile(archive,bytes,{flag:'wx'})
}
if(createHash('sha256').update(bytes).digest('hex')!==digest)throw Error('GoCaptcha 压缩包校验失败，请检查来源')
try{await access(exe)}catch{execFileSync('tar',['-xzf',archive,'-C',dir],{windowsHide:true})}
let existing={};try{existing=JSON.parse(await readFile(resolve(dir,'sxb-config.json'),'utf8'))}catch{}
const config={config_version:1,service_name:'sxb-go-captcha',http_host:'127.0.0.1',http_port:'4311',grpc_host:'127.0.0.1',grpc_port:'54311',cache_type:'memory',cache_ttl:300,rate_limit_qps:10,rate_limit_burst:20,enable_cors:false,log_level:'error',enable_dynamic_config:false,enable_service_discovery:false,
 api_keys:[existing.api_keys?.[0]||randomBytes(32).toString('hex')],
 auth_apis:['/api/v1/manage/get-status-info','/api/v1/manage/del-status-info','/api/v1/manage/upload-resource','/api/v1/manage/delete-resource','/api/v1/manage/get-resource-list','/api/v1/manage/get-config','/api/v1/manage/update-hot-config','/api/v1/manage/update-rate-limit','/gocaptcha.GoCaptchaService/GetStatusInfo','/gocaptcha.GoCaptchaService/DelStatusInfo']}
await writeFile(resolve(dir,'sxb-config.json'),JSON.stringify(config,null,2),{mode:0o600})
console.log('GoCaptcha 已安装并校验；仅监听本机，管理接口使用独立密钥。运行 node scripts/start-local.mjs 启动。')

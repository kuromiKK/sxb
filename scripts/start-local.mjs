import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import net from 'node:net'
import {startLocalPostgres} from './local-postgres.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
for (const file of ['.env', 'node_modules/vite/bin/vite.js', 'apps/user/node_modules/@dcloudio/vite-plugin-uni/bin/uni.js']) {
  if (!existsSync(resolve(root, file))) throw new Error(`Missing ${file}. See docs/LOCAL-TEST.md.`)
}
mkdirSync(resolve(root, '.local'), { recursive: true })
await startLocalPostgres()
const occupied = port => new Promise(resolve => {
  const socket = net.connect({ port, host: '127.0.0.1' })
  socket.once('connect', () => { socket.destroy(); resolve(true) })
  socket.once('error', () => resolve(false))
})
for (const service of [
  { name: 'go-captcha', port: 4311, cwd: resolve(root,'.local/go-captcha'), executable:resolve(root,'.local/go-captcha/go-captcha-service-windows-amd64.exe'), args: ['-config','sxb-config.json'] },
  { name: 'api', port: 4310, cwd: root, args: ['--experimental-strip-types', 'apps/api/src/main.ts'] },
  { name: 'admin', port: 5180, cwd: root, args: ['node_modules/vite/bin/vite.js', '--config', 'apps/admin/vite.config.ts'] },
  { name: 'user', port: 5174, cwd: resolve(root, 'apps/user'), args: ['node_modules/@dcloudio/vite-plugin-uni/bin/uni.js', '-p', 'h5'] },
]) {
  if (await occupied(service.port)) { console.log(`${service.name}: port ${service.port} already occupied; left untouched`); continue }
  if(service.executable&&!existsSync(service.executable)){console.log('go-captcha: run node scripts/setup-go-captcha.mjs first');continue}
  const out = openSync(resolve(root, `.local/${service.name}.out.log`), 'a')
  const err = openSync(resolve(root, `.local/${service.name}.err.log`), 'a')
  const child = spawn(service.executable||process.execPath, service.args, { cwd: service.cwd, detached: true, windowsHide: true, stdio: ['ignore', out, err] })
  child.unref(); closeSync(out); closeSync(err)
  console.log(`${service.name}: started PID ${child.pid}, port ${service.port}`)
}
console.log('Admin: http://127.0.0.1:5180 | User: http://127.0.0.1:5174')
console.log('Local HTTP; services bind to this computer only. Production requires HTTPS.')

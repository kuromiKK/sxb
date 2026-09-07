import 'reflect-metadata'
import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { Module } from '@nestjs/common'
import express from 'express'
import helmet from 'helmet'
import { ZodError } from 'zod'
import { api } from './routes.ts'
import { seed } from './seed.ts'
import { initSecrets } from './security.ts'

class AppModule {}
Module({})(AppModule)
await initSecrets()
await seed()
const app=await NestFactory.create(AppModule,{bodyParser:false})
app.use(helmet())
app.use(express.json({limit:'12mb'}))
app.enableCors({origin:[process.env.ADMIN_ORIGIN||'http://127.0.0.1:5180',process.env.USER_ORIGIN||'http://127.0.0.1:5174'],methods:['GET','POST','PUT','PATCH','DELETE']})
app.use('/api',api)
app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  if(error instanceof ZodError) return res.status(400).json({message:error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')})
  const status=error.status|| (error.code==='23505'?409:error.code==='23503'?400:500)
  if(status===500) console.error('API error',error.code||error.name,error.message)
  res.status(status).json({message:status===500?'服务暂时不可用，请稍后重试':error.code==='23505'?'记录已存在，请刷新后重试':error.code==='23503'?'关联记录不存在':error.message})
})
const port=Number(process.env.API_PORT||4310)
if(port===3000) throw new Error('Port 3000 is reserved')
await app.listen(port,process.env.API_HOST||'127.0.0.1')
console.log(`SXB API http://localhost:${port}/api/health`)

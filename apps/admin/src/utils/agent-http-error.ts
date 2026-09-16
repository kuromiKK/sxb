// The platform returns {message}; Page Agent expects {error:{message}}.
// Read only structured errors, never display an HTML proxy response in the assistant.
export async function agentHttpError(response:Response):Promise<string>{
 try{
  const data=await response.clone().json()
  const message=data?.message||data?.error?.message
  if(typeof message==='string'&&message.trim())return message.slice(0,1500)
 }catch{}
 const messages:Record<number,string>={400:'AI员工请求参数不符合接口要求，请刷新页面后重试',401:'登录已失效，请重新登录后使用 AI员工',403:'当前账号无权使用 AI员工，或该功能尚未启用',404:'AI员工接口不存在，请刷新页面；若仍报错，请检查后端版本与接口部署路径',413:'页面内容过多，请缩小任务范围',429:'AI员工调用过于频繁或已达到额度，请稍后重试',502:'模型服务连接失败，请检查服务地址、模型和网络',503:'AI员工服务暂时不可用，请稍后重试',504:'模型服务响应超时，请稍后重试'}
 return messages[response.status]||`AI员工请求失败（HTTP ${response.status}），请稍后重试`
}

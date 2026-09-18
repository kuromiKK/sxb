export async function request(path:string, options:RequestInit={}) {
  const token=sessionStorage.getItem('sxb-admin-token')
  let response:Response
  try {
    response=await fetch('/api'+path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...options.headers}})
  } catch(error) {
    if(options.signal?.aborted)throw error
    throw new Error('无法连接后台服务，请检查网络或联系管理员')
  }
  // Authentication must still expire when a proxy returns an empty 401 response.
  if(response.status===401){sessionStorage.removeItem('sxb-admin-token');window.dispatchEvent(new Event('sxb-unauthorized'))}
  const fallback=response.status===401?'登录已过期，请重新登录':response.status>=500?'后台服务暂时不可用，请稍后刷新重试':`请求失败（HTTP ${response.status}）`
  let body:string
  try { body=await response.text() } catch { throw new Error('服务器响应中断，请稍后刷新重试') }
  let data:any
  if(body.trim()) {
    try { data=JSON.parse(body) } catch { throw new Error(response.ok?'服务器返回的数据格式异常，请联系管理员':fallback) }
  }
  if(!response.ok) {
    throw new Error(typeof data?.message==='string'&&data.message?data.message:fallback)
  }
  if(response.status===204||options.method?.toUpperCase()==='HEAD')return undefined
  if(!body.trim())throw new Error('服务器未返回数据，请稍后刷新重试')
  return data
}
export const send=(path:string,data:any,method='POST')=>request(path,{method,body:JSON.stringify(data)})

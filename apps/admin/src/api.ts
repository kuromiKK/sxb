export async function request(path:string, options:RequestInit={}) {
  const token=sessionStorage.getItem('sxb-admin-token')
  const response=await fetch('/api'+path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...options.headers}})
  const data=await response.json()
  if(!response.ok) {
    if(response.status===401){sessionStorage.removeItem('sxb-admin-token');window.dispatchEvent(new Event('sxb-unauthorized'))}
    throw new Error(data.message||'请求失败')
  }
  return data
}
export const send=(path:string,data:any,method='POST')=>request(path,{method,body:JSON.stringify(data)})

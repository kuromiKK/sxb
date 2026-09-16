import test from 'node:test'
import assert from 'node:assert/strict'
import {pinnedPublicLookup,modelPublicLookup} from '../apps/api/src/ai.ts'

test('pinned public DNS supports Node family auto-selection and single-address consumers',()=>{
 const source=['104.18.0.165','104.18.1.165'],lookup=pinnedPublicLookup(source)
 source[0]='127.0.0.1'
 lookup('example.com',{all:true},(err,addresses,family)=>{
  assert.equal(err,null);assert.deepEqual(addresses,[{address:'104.18.0.165',family:4},{address:'104.18.1.165',family:4}]);assert.equal(family,undefined)
 })
 lookup('example.com',{family:4},(err,address,family)=>{assert.equal(err,null);assert.equal(address,'104.18.0.165');assert.equal(family,4)})
})

test('pinning still rejects Fake-IP, local, reserved and mixed DNS answers',()=>{
 for(const addresses of [[],['198.18.2.74'],['127.0.0.1'],['10.0.0.1'],['169.254.169.254'],['::1'],['104.18.0.165','192.168.1.1']])assert.throws(()=>pinnedPublicLookup(addresses),/内网或保留地址/)
})

test('Fake-IP fallback only uses validated public DNS answers and pins the result',async()=>{
 let calls=0
 const dns=async()=>{calls++;return ['104.18.0.165','104.18.1.165']}
 const lookup=await modelPublicLookup('example.com',async()=>['198.18.2.74'],dns)
 lookup('example.com',{all:true},(error,addresses)=>{assert.equal(error,null);assert.deepEqual(addresses,[{address:'104.18.0.165',family:4},{address:'104.18.1.165',family:4}])})
 assert.equal(calls,1)
 await modelPublicLookup('example.com',async()=>['104.18.0.165'],dns);assert.equal(calls,1)
 for(const addresses of [['127.0.0.1'],['10.0.0.1'],['198.18.2.74','127.0.0.1'],['198.18.2.74','104.18.0.165'],[]])await assert.rejects(()=>modelPublicLookup('example.com',async()=>addresses,dns),/内网或保留地址/)
 await assert.rejects(()=>modelPublicLookup('198.18.2.74',async()=>['198.18.2.74'],dns),/内网或保留地址/)
 assert.equal(calls,1,'normal private/mixed/literal addresses cannot trigger an alternate resolver')
 for(const addresses of [['198.18.1.2'],['127.0.0.1'],['104.18.0.165','10.0.0.1'],[]])await assert.rejects(()=>modelPublicLookup('example.com',async()=>['198.19.1.1'],async()=>addresses),/内网或保留地址/)
 await assert.rejects(()=>modelPublicLookup('example.com',async()=>['198.18.2.74'],async()=>{throw Error('DNS timeout')}),/内网或保留地址/)
})

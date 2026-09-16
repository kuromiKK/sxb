import test from 'node:test'
import assert from 'node:assert/strict'
import {pinnedPublicLookup} from '../apps/api/src/ai.ts'

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

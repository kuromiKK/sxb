import test from 'node:test'
import assert from 'node:assert/strict'
import {buildKnowledgeRows,shortTitle} from '../apps/admin/src/utils/knowledge-list.ts'
test('hierarchy paths and counts use the complete tree, and truncate Unicode safely',()=>{
 const rows=[{id:'s',kind:'subject',title:'科目'},{id:'c',kind:'chapter',title:'第1章 章标题',parent_id:'s'},{id:'t',kind:'section',title:'第1节 节标题',parent_id:'c'},{id:'k',kind:'knowledge',title:'知'.repeat(51),parent_id:'t'}]
 const tree=[{id:'s',chapters:[{id:'c',sections:[{id:'t',courses:[{id:'course'}],knowledge:[{id:'k',questions:3,courses:[]}]}]}]}]
 const data=buildKnowledgeRows(rows,tree)
 assert.equal(data[1].displayTitle,'第1章 章标题');assert.equal(data[2].displayTitle,'第1节 节标题')
 assert.equal(data[3].parentPath,'1-1-1');assert.equal(data[3].parentTitle,'节标题');assert.equal(data[3].questionCount,3)
 assert.equal(data[2].hasCourse,true);assert.equal(data[3].hasCourse,false);assert.equal(data[1].childCount,1)
 assert.equal(shortTitle('知'.repeat(51)),'知'.repeat(50)+'...');assert.equal(shortTitle('😀'.repeat(51)),'😀'.repeat(50)+'...')
})

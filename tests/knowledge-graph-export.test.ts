import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { createGraphWorkbook, graphTitleRows, graphHeaders, graphExportFilename, type GraphExport } from '../apps/admin/src/utils/knowledge-graph-export.ts'

const graph: GraphExport = {
  categoryTitle: '职业考试', examTitle: '初级社会工作师', isDemo: true,
  subjects: [
    {title:'基础理论',chapters:[{title:'长章节名称'.repeat(15),sections:[
      {title:'第一节',knowledge:[{title:'=原样保留标题'},{title:'知识点二'}]},
      {title:'第二节',knowledge:[]}
    ]},{title:'空章',sections:[]}]},
    {title:'实务方法',chapters:[{title:'第三章',sections:[{title:'第三节',knowledge:[{title:'末尾知识点'}]}]}]},
    {title:'空科目',chapters:[]}
  ]
}

test('exports all six levels, source order and empty branches without truncating titles',()=>{
  const rows=graphTitleRows(graph)
  assert.equal(rows.length,6)
  assert.deepEqual(rows[0],['职业考试','初级社会工作师','基础理论','长章节名称'.repeat(15),'第一节','=原样保留标题'])
  assert.deepEqual(rows[2].slice(4),['第二节',''])
  assert.deepEqual(rows[3].slice(3),['空章','',''])
  assert.equal(rows[4][5],'末尾知识点')
  assert.deepEqual(rows[5].slice(2),['空科目','','',''])
  assert.deepEqual(graphTitleRows({...graph,subjects:[]}),[['职业考试','初级社会工作师','','','','']])
})

test('real XLSX round-trip retains complete titles as strings and marks demo data',async()=>{
  const bytes=await createGraphWorkbook(graph).xlsx.writeBuffer()
  const loaded=new ExcelJS.Workbook()
  await loaded.xlsx.load(bytes)
  const sheet=loaded.worksheets[0]
  assert.equal(sheet.rowCount,7)
  assert.deepEqual((sheet.getRow(1).values as string[]).slice(1),graphHeaders)
  assert.equal(sheet.getCell('D2').value,'长章节名称'.repeat(15))
  assert.equal(sheet.getCell('F2').type,ExcelJS.ValueType.String)
  assert.equal(sheet.getCell('F2').value,'=原样保留标题')
  assert.equal(sheet.getCell('F6').value,'末尾知识点')
  assert.match(String(loaded.getWorksheet('导出说明')?.getCell('B4').value),/测试数据/)
  const other=createGraphWorkbook({...graph,examTitle:'另一个考试',subjects:[],isDemo:false})
  assert.equal(other.worksheets[0].getCell('B2').value,'另一个考试')
  assert.equal(other.worksheets[0].rowCount,2)
  assert.equal(graphExportFilename('考试/一:*',true),'考试_一___知识图谱_L1-L6_测试数据.xlsx')
})

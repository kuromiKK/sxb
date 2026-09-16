import ExcelJS from 'exceljs'

interface Titled { title: string }
interface Section extends Titled { knowledge: Titled[] }
interface Chapter extends Titled { sections: Section[] }
interface Subject extends Titled { chapters: Chapter[] }
export interface GraphExport {
  categoryTitle: string
  examTitle: string
  subjects: Subject[]
  isDemo: boolean
}

export const graphHeaders = ['L1 考试分类', 'L2 考试项目', 'L3 科目', 'L4 章', 'L5 节', 'L6 知识点']

/** Export every branch in source order, including parents with no children. */
export function graphTitleRows(graph: GraphExport): string[][] {
  const rows: string[][] = []
  const visit = (path: string[], children: Titled[], level: number) => {
    if (!children.length) {
      rows.push([...path, ...Array(6 - path.length).fill('')])
      return
    }
    for (const node of children) {
      const next = [...path, node.title]
      if (level === 6) rows.push(next)
      else {
        const children = level === 3 ? (node as Subject).chapters
          : level === 4 ? (node as Chapter).sections : (node as Section).knowledge
        visit(next, children, level + 1)
      }
    }
  }
  visit([graph.categoryTitle, graph.examTitle], graph.subjects, 3)
  return rows
}

export function graphExportFilename(examTitle: string, isDemo: boolean): string {
  const title = examTitle.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().slice(0, 80) || '未命名考试'
  return `${title}_知识图谱_L1-L6${isDemo ? '_测试数据' : ''}.xlsx`
}

export function createGraphWorkbook(graph: GraphExport) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '上行宝'
  workbook.subject = graph.isDemo ? '知识图谱目录（测试数据）' : '知识图谱目录'
  const sheet = workbook.addWorksheet(graph.isDemo ? 'L1-L6目录（测试数据）' : 'L1-L6目录', {
    views: [{ state: 'frozen', ySplit: 1 }]
  })
  const widths = [22, 28, 24, 48, 56, 40]
  sheet.columns = graphHeaders.map((header, i) => ({ header, width: widths[i] }))
  const rows = graphTitleRows(graph)
  rows.forEach(values => {
    // Plain string values keep titles beginning with =, +, - or @ from becoming formulas.
    const row = sheet.addRow(values)
    row.height = Math.max(36, ...values.map((value, i) => Math.ceil(value.length * 2 / (widths[i] - 2)) * 18 + 12))
    row.eachCell(cell => {
      cell.font = { name: '微软雅黑', size: 11, color: { argb: 'FF334155' } }
      cell.alignment = { vertical: 'middle', wrapText: true }
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } }
      if (row.number % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F8FC' } }
    })
  })
  const header = sheet.getRow(1)
  header.height = 32
  header.eachCell(cell => {
    cell.font = { name: '微软雅黑', bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3569E8' } }
    cell.alignment = { vertical: 'middle', wrapText: true }
  })
  sheet.autoFilter = { from: 'A1', to: `F${sheet.rowCount}` }
  sheet.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' }
  const notes = workbook.addWorksheet('导出说明')
  notes.columns = [{ width: 20 }, { width: 100 }]
  notes.addRows([
    ['考试项目', graph.examTitle],
    ['导出范围', '当前考试全部科目、章、节、知识点标题；包含折叠的目录分支。'],
    ['层级定义', graphHeaders.join(' → ')],
    ['数据来源', graph.isDemo ? '当前页面的演示目录，属于测试数据，不代表已发布的正式内容。' : '当前考试知识目录'],
    ['空目录', '没有下级内容的目录仍保留一行，其后层级留空。']
  ])
  notes.eachRow(row => {
    row.height = 36
    row.eachCell(cell => { cell.alignment = { vertical: 'middle', wrapText: true }; cell.font = { name: '微软雅黑', size: 11 } })
  })
  return workbook
}

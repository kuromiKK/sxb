export const bulkActions = [
 {value:'enable',label:'启用',description:'恢复停用前的状态；没有历史状态时恢复为草稿。启用不会将草稿直接发布。'},
 {value:'disable',label:'停用',description:'隐藏内容并记住原状态，后续可以启用恢复。'},
 {value:'publish',label:'发布',description:'通过内容校验后发布。草稿需先提交审核；停用前已发布的内容可重新发布。'},
 {value:'unpublish',label:'停用',description:'内容不再向学员展示，保留数据与关联。'},
 {value:'draft',label:'转为草稿',description:'撤回为草稿，不再向学员展示，并清除之前的恢复状态。'},
 {value:'review',label:'提交审核',description:'将草稿提交审核，之后可执行批量发布。'},
] as const
export type BulkAction = typeof bulkActions[number]['value']
export const bulkStatusLabels:Record<string,string>={draft:'草稿',review:'审核中',published:'已发布',offline:'停用'}
export const bulkModules={knowledge:['subject','chapter','section','knowledge'],question:['question'],course:['course'],articles:['faq'],cheatsheet:['cheatsheet']} as const
export type BulkModule=keyof typeof bulkModules
export function bulkModuleKinds(module:BulkModule|''):readonly string[]|null{return module?bulkModules[module]:null}
export function bulkStatusesFor(kind:string):Record<string,string>{return kind==='faq'?{draft:'未上架（草稿）',review:'未上架（审核中）',published:'已上架',offline:'已下架'}:bulkStatusLabels}
export function bulkActionsFor(kind:string):{value:BulkAction;label:string;description:string}[]{
 if(kind==='faq')return [{value:'publish',label:'上架',description:'通过文章校验后，向适用考试的用户展示文章。'},{value:'unpublish',label:'下架',description:'文章不再向用户展示，保留内容与关联。'}]
 return bulkActions.filter(a=>a.value!=='unpublish')
}
export function bulkActionLabel(action:BulkAction,kind:string){return bulkActionsFor(kind).find(a=>a.value===action)?.label||(kind==='faq'&&action==='disable'?'下架':bulkActions.find(a=>a.value===action)!.label)}
export const bulkKindLabels:Record<string,string>={subject:'科目',chapter:'章',section:'节',knowledge:'知识点',question:'题目',course:'课程',handout:'讲义',article:'考前须知',faq:'文章',announcement:'公告',cheatsheet:'考前小抄'}

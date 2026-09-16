import {z} from 'zod'

export const agentPages=[
 {id:'knowledge-graph',name:'知识图谱'}, {id:'question',name:'题目管理'}, {id:'question-types',name:'题型管理'},
 {id:'course',name:'课程管理'}, {id:'articles',name:'文章管理'}, {id:'exam-projects',name:'考试项目'},
 {id:'exam-categories',name:'考试分类'}, {id:'products',name:'商品管理'}, {id:'cheatsheet',name:'考前小抄'},
 {id:'media',name:'资源管理'}, {id:'records',name:'学习数据'}
] as const
const color=z.string().regex(/^#[\da-f]{6}$/i,'请选择有效的六位十六进制颜色')
export const agentAppearanceSchema=z.object({
 theme:z.enum(['auto','light','dark']).default('auto'),
 primaryColor:color.default('#315bea'),
 backgroundLight:color.default('#ffffff'),backgroundDark:color.default('#161c2a'),
}).strict()
export type AgentAppearance=z.infer<typeof agentAppearanceSchema>
export const pageAgentSchema=z.object({
 appearance:agentAppearanceSchema.default(()=>agentAppearanceSchema.parse({})),
 enabled:z.boolean().default(false),name:z.string().trim().min(1).max(20).default('AI员工'),
 baseUrl:z.url().refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash},'请填写不含凭据和查询参数的 HTTPS API 地址').default('https://dashscope.aliyuncs.com/compatible-mode/v1'),
 model:z.string().trim().min(1).max(100).default('qwen3.5-plus'),
 maxSteps:z.number().int().min(3).max(60).default(20),timeoutSeconds:z.number().int().min(10).max(120).default(60),
 dailyLimit:z.number().int().min(10).max(5000).default(300),confirmActions:z.boolean().default(true),
 instructions:z.string().trim().max(6000).default('你是上行宝后台的内容运营助手，使用中文交流。先确认所属考试，再操作科目、章、节、知识点、题目或课程。精品课属于节，配套课属于知识点。保持现有内容，完成后检查保存结果。不要编造考试政策或知识内容。'),
 allowedPages:z.array(z.enum(agentPages.map(p=>p.id))).min(1).max(agentPages.length).default(['knowledge-graph','question','course','articles']),
}).strict()
export type PageAgentSettings=z.infer<typeof pageAgentSchema>
export const pageAgentDefaults=pageAgentSchema.parse({})
export const pageAgentUiSchema=pageAgentSchema.omit({baseUrl:true,model:true,timeoutSeconds:true,dailyLimit:true})
export const graphSchema=z.object({
 colors:z.object({exam:color,subject:color,chapter:color,section:color,knowledge:color,course:color}).strict().default({exam:'#315bea',subject:'#7948df',chapter:'#3470ed',section:'#008e9b',knowledge:'#b86a00',course:'#d4407c'}),
 background:color.default('#fafbff'),grid:z.boolean().default(true),nodeStyle:z.enum(['gradient','soft','outline']).default('gradient'),
 radius:z.number().int().min(0).max(24).default(13),shadow:z.boolean().default(true),fontSize:z.number().int().min(12).max(18).default(14),
 edgeType:z.enum(['line','cubic-horizontal','polyline']).default('line'),mindEdgeType:z.enum(['line','cubic-horizontal','polyline']).default('cubic-horizontal'),
 edgeWidth:z.number().min(1).max(5).default(2),edgeDashed:z.boolean().default(false),
 canvasHeight:z.number().int().min(500).max(1200).default(760),animation:z.boolean().default(true),
}).strict()
export type GraphSettings=z.infer<typeof graphSchema>
export const graphDefaults=graphSchema.parse({})
export const graphPresets=[
 {name:'明亮活力',value:graphDefaults},
 {name:'清新自然',value:graphSchema.parse({colors:{exam:'#087f6f',subject:'#277a47',chapter:'#377f9a',section:'#687a1b',knowledge:'#b56b16',course:'#9b5382'},background:'#f6faf8',nodeStyle:'soft',shadow:false})},
 {name:'简约蓝灰',value:graphSchema.parse({colors:{exam:'#334e75',subject:'#526b99',chapter:'#427c9e',section:'#437f83',knowledge:'#936a39',course:'#80648b'},background:'#f8fafc',grid:false,nodeStyle:'outline',radius:6,shadow:false})},
]

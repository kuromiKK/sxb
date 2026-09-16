/** Shared contract for the designer, authoring form and student renderer. */
export type FieldKind = 'material' | 'options' | 'single' | 'multiple' | 'boolean' | 'text' | 'group'
export type QuestionField = {
  id:string; kind:FieldKind; label:string; help:string; required:boolean; answerRequired:boolean;
  defaultValue:string; minOptions:number; maxOptions:number; optionsSource:string;
  aiGrading?:boolean;
  maxScore:number; scoring:'exact'|'partial'; partialScore:number; children:QuestionField[]
}
export type TypeDefinition = {fields:QuestionField[]; examRules:Record<string,Record<string,{maxScore:number;scoring:'exact'|'partial';partialScore:number}>>}
export type TypeRecord = {id:string;name:string;description:string;enabled:boolean;builtin:boolean;version:number;definition:TypeDefinition;question_count?:number;updated_at?:string}
export const fieldNames:Record<FieldKind,string>={material:'公共材料',options:'共用选项',single:'单选作答',multiple:'多选作答',boolean:'判断作答',text:'主观作答',group:'小题组'}
export const isAnswer=(f:QuestionField)=>['single','multiple','boolean','text'].includes(f.kind)
export function flattenFields(fields:QuestionField[]):QuestionField[]{return fields.flatMap(f=>[f,...flattenFields(f.children||[])])}
export function supportsAutomaticGrading(question:any){return question.type!=='subjective'&&(question.type!=='configured'||!flattenFields(question.definition.fields).some(f=>f.kind==='text'))}
export function newField(kind:FieldKind,id:string):QuestionField {
  return {id,kind,label:fieldNames[kind],help:'',required:true,answerRequired:true,defaultValue:'',minOptions:2,maxOptions:10,optionsSource:'',maxScore:kind==='text'?10:1,scoring:'exact',partialScore:0.5,children:[],...(kind==='text'?{aiGrading:false}:{})}
}
export function initialValues(def:TypeDefinition):Record<string,any>{
  return Object.fromEntries(flattenFields(def.fields).filter(f=>f.kind!=='group').map(f=>[f.id,
    f.kind==='material'?f.defaultValue:f.kind==='options'?Array.from({length:f.minOptions},()=>''): {prompt:f.defaultValue,options:f.kind==='boolean'?['正确','错误']:f.kind==='text'||f.optionsSource?[]:Array.from({length:f.minOptions},()=>''),answer:[],reference:'',rubric:'',explanation:''}]))
}
export function examDefinition(def:TypeDefinition,examId:string):TypeDefinition{
  const rules=def.examRules?.[examId]||{}
  const map=(fields:QuestionField[]):QuestionField[]=>fields.map(f=>({...f,...rules[f.id],children:map(f.children||[])}))
  return {fields:map(def.fields),examRules:{}}
}
export function optionsFor(field:QuestionField,values:Record<string,any>):string[]{
  return field.kind==='boolean'?['正确','错误']:field.optionsSource?(values[field.optionsSource]||[]):(values[field.id]?.options||[])
}
export function legacyValues(payload:any,definition:TypeDefinition){
  if(payload.type==='configured')return payload.values
  const values=initialValues(definition),f=flattenFields(definition.fields).find(isAnswer)
  if(f)values[f.id]={prompt:payload.stem,options:payload.options||[],answer:payload.answer||[],reference:payload.referenceAnswer||'',rubric:payload.rubric||'',explanation:payload.explanation||''}
  return values
}
export function publicQuestion(payload:any){
  if(payload.type!=='configured'){const {answer,explanation,referenceAnswer,rubric,...rest}=payload;return {...rest,answer:[],explanation:''}}
  // Allowlist instead of recursively trying to redact arbitrary custom input.
  const values:Record<string,any>={}
  for(const f of flattenFields(payload.definition.fields)){
    const v=payload.values[f.id]
    if(f.kind==='material'||f.kind==='options')values[f.id]=v
    else if(isAnswer(f))values[f.id]={prompt:v?.prompt||'',options:optionsFor(f,payload.values)}
  }
  return {type:'configured',templateId:payload.templateId,templateVersion:payload.templateVersion,typeName:payload.typeName,definition:payload.definition,values,stem:payload.stem,options:[],answer:[],explanation:'',knowledgePointId:payload.knowledgePointId,knowledgePointIds:payload.knowledgePointIds,year:payload.year,source:payload.source}
}

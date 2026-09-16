import { transaction, type Queryable } from './db.ts'

export const questionGrades=['A','B','C','D','E'] as const

export async function migrateQuestionGrades(){await transaction(migrateQuestionGradeTable)}

export async function migrateQuestionGradeTable(c:Queryable){
  await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
  if((await c.query('SELECT 1 FROM schema_versions WHERE version=12')).rows.length)return
  // No default: existing and ungraded imported questions stay unclassified.
  // Kept outside the legacy content projection so older writers preserve it.
  await c.query("ALTER TABLE questions ADD COLUMN grade text CONSTRAINT questions_grade_check CHECK (grade IN ('A','B','C','D','E'))")
  await c.query("COMMENT ON COLUMN questions.grade IS '题目等级 A/B/C/D/E；NULL 表示尚未设置，不代表难度排序'")
  await c.query('INSERT INTO schema_versions(version) VALUES(12)')
}

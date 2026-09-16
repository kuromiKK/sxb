import { transaction, type Queryable } from './db.ts'
import { fail, id } from './security.ts'

// exam_cycles is the authoritative period used by orders and entitlements.
// Keep the article IDs in exam_year_entries and existing cycle IDs intact.
export async function migrateExamPeriods() {
  await transaction(async c => {
    await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
    if ((await c.query('SELECT 1 FROM schema_versions WHERE version=15')).rows.length) return
    await c.query('ALTER TABLE exam_cycles ADD COLUMN IF NOT EXISTS starts_at timestamptz')
    await c.query(`INSERT INTO exam_cycles(id,exam_id,year,ends_at)
      SELECT 'period-'||y.id,y.exam_id,y.year,(y.cutoff_date+time '23:59:59') AT TIME ZONE 'Asia/Shanghai'
      FROM exam_year_entries y WHERE y.cutoff_date IS NOT NULL ON CONFLICT(exam_id,year) DO NOTHING`)
    await c.query(`WITH dates AS (SELECT id,coalesce(lag(ends_at) OVER(PARTITION BY exam_id ORDER BY year),ends_at-interval '1 year')+interval '1 second' AS start FROM exam_cycles)
      UPDATE exam_cycles c SET starts_at=d.start FROM dates d WHERE c.id=d.id AND c.starts_at IS NULL`)
    await c.query(`INSERT INTO exam_year_entries(id,exam_id,year,cutoff_date)
      SELECT 'period-guide-'||c.id,c.exam_id,c.year,(c.ends_at AT TIME ZONE 'Asia/Shanghai')::date FROM exam_cycles c ON CONFLICT(exam_id,year) DO NOTHING`)
    // Compatibility for legacy seed/import callers; new admin writes require both dates.
    await c.query(`CREATE OR REPLACE FUNCTION default_exam_period_start() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.starts_at IS NULL THEN NEW.starts_at:=NEW.ends_at-interval '1 year'+interval '1 second'; END IF; RETURN NEW; END $$`)
    await c.query('CREATE TRIGGER exam_period_start BEFORE INSERT ON exam_cycles FOR EACH ROW EXECUTE FUNCTION default_exam_period_start()')
    await c.query('ALTER TABLE exam_cycles ALTER COLUMN starts_at SET NOT NULL')
    await c.query('INSERT INTO schema_versions(version) VALUES(15)')
  })
}

export type ExamPeriod = { id: string; year: number; startsAt: string; endsAt: string }
export function validateExamPeriods(periods: ExamPeriod[]) {
  const sorted=[...periods].sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt))
  for(let i=0;i<sorted.length;i++) {
    const period=sorted[i]
    if(Date.parse(period.startsAt)>=Date.parse(period.endsAt)) fail(400,`${period.year} 年考期的结束时间必须晚于开始时间`)
    if(i&&Date.parse(period.startsAt)<Date.parse(sorted[i-1].endsAt)) fail(400,'同一考试的考期时间不能重叠')
  }
}

export async function saveExamPeriods(c:Queryable,examId:string,periods:ExamPeriod[]) {
  const existing=(await c.query('SELECT * FROM exam_cycles WHERE exam_id=$1 FOR UPDATE',[examId])).rows
  for(const old of existing.filter(o=>!periods.some(p=>p.year===o.year))) {
    const used=(await c.query(`SELECT 1 FROM orders WHERE cycle_id=$1 UNION ALL SELECT 1 FROM manual_entitlements WHERE cycle_id=$1 UNION ALL SELECT 1 FROM product_entitlements WHERE cycle_id=$1 LIMIT 1`,[old.id])).rows.length
    if(used) fail(409,`${old.year} 年考期已关联商品、订单或人工权益，不能删除或修改年份`)
    await c.query('DELETE FROM exam_cycles WHERE id=$1',[old.id])
  }
  for(const period of periods) await c.query(`INSERT INTO exam_cycles(id,exam_id,year,starts_at,ends_at) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(exam_id,year) DO UPDATE SET starts_at=excluded.starts_at,ends_at=excluded.ends_at`,
    [id(),examId,period.year,period.startsAt,period.endsAt])
}

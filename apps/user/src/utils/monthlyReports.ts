export type MonthlyReportStatus = 'ready' | 'generating'

export type MonthlyReport = {
  id: string
  year: number
  month: number
  status: MonthlyReportStatus
  generatedAt?: string
  summary: string
  headline: string
  metrics: {
    studyDays: number
    minutes: number
    questions: number
    accuracy: number
    lessons: number
    knowledge: number
    masteryGain: number
    longestStreak: number
  }
  dailyQuestions: number[]
  subjects: Array<{ name: string; total: number; correct: number }>
  chapters: Array<{ name: string; mastery: number; change: number; weak?: boolean }>
  tools: Array<{ label: string; value: number; unit: string; note: string }>
  highlights: string[]
  concerns: string[]
  nextSteps: string[]
}

export const monthlyReports: MonthlyReport[] = [
  {
    id: '2026-08', year: 2026, month: 8, status: 'generating',
    summary: '本月学习数据持续汇总中', headline: '坚持学习，8月报告将在9月1日生成',
    metrics: { studyDays: 10, minutes: 327, questions: 86, accuracy: 78, lessons: 5, knowledge: 18, masteryGain: 4, longestStreak: 6 },
    dailyQuestions: [], subjects: [], chapters: [], tools: [], highlights: [], concerns: [], nextSteps: [],
  },
  {
    id: '2026-07', year: 2026, month: 7, status: 'ready', generatedAt: '2026-08-01 08:00',
    summary: '学习节奏稳定，错题修正效果突出',
    headline: '本月学习22天，完成428道题，知识点掌握率提升14%',
    metrics: { studyDays: 22, minutes: 1186, questions: 428, accuracy: 82, lessons: 14, knowledge: 37, masteryGain: 14, longestStreak: 9 },
    dailyQuestions: [18, 24, 0, 16, 20, 28, 21, 0, 14, 25, 30, 18, 24, 0, 12, 22, 26, 19, 31, 15, 0, 28, 25, 17, 20, 23, 0, 16, 21, 15, 20],
    subjects: [
      { name: '综合能力', total: 186, correct: 158 },
      { name: '实务', total: 144, correct: 116 },
      { name: '法规政策', total: 98, correct: 77 },
    ],
    chapters: [
      { name: '社会工作价值观', mastery: 91, change: 18 },
      { name: '个案工作方法', mastery: 84, change: 16 },
      { name: '小组工作方法', mastery: 73, change: 11 },
      { name: '社区工作方法', mastery: 46, change: 5, weak: true },
      { name: '社会政策法规', mastery: 62, change: 9 },
    ],
    tools: [
      { label: '完成精讲课', value: 14, unit: '节', note: '课程完成率 78%' },
      { label: '学习知识点', value: 37, unit: '个', note: '12个达到90%掌握' },
      { label: '新增笔记', value: 19, unit: '条', note: '编辑笔记 31 次' },
      { label: '下载讲义', value: 8, unit: '份', note: '涉及 7 节课程' },
      { label: '新增收藏', value: 16, unit: '条', note: '月末收藏 43 条' },
      { label: '修正错题', value: 29, unit: '道', note: '重做正确率 81%' },
    ],
    highlights: ['连续学习9天，学习稳定性较上月明显提升', '错题重做29道，其中24道答对并移出错题本', '社会工作价值观章节掌握度达到91%'],
    concerns: ['社区工作方法掌握度46%，仍有6个薄弱知识点', '法规政策科目正确率低于本月平均水平'],
    nextSteps: ['优先完成社区工作方法6个薄弱知识点强化', '每周安排2次错题复习，每次不少于15题', '完成剩余4节未学完精讲课并下载配套讲义'],
  },
  {
    id: '2026-06', year: 2026, month: 6, status: 'ready', generatedAt: '2026-07-01 08:00',
    summary: '已建立学习习惯，章节覆盖仍需扩大',
    headline: '本月学习17天，完成286道题，知识点掌握率提升9%',
    metrics: { studyDays: 17, minutes: 792, questions: 286, accuracy: 74, lessons: 9, knowledge: 24, masteryGain: 9, longestStreak: 6 },
    dailyQuestions: [12, 18, 0, 0, 16, 22, 14, 20, 0, 12, 18, 24, 17, 0, 19, 15, 0, 21, 26, 14, 18, 0, 16, 20, 13, 0, 17, 22, 0, 15],
    subjects: [
      { name: '综合能力', total: 132, correct: 103 },
      { name: '实务', total: 96, correct: 70 },
      { name: '法规政策', total: 58, correct: 39 },
    ],
    chapters: [
      { name: '社会工作目标', mastery: 86, change: 15 },
      { name: '社会工作价值观', mastery: 73, change: 12 },
      { name: '个案工作方法', mastery: 61, change: 8 },
      { name: '小组工作方法', mastery: 48, change: 4, weak: true },
      { name: '社区工作方法', mastery: 39, change: 3, weak: true },
    ],
    tools: [
      { label: '完成精讲课', value: 9, unit: '节', note: '课程完成率 60%' },
      { label: '学习知识点', value: 24, unit: '个', note: '6个达到90%掌握' },
      { label: '新增笔记', value: 12, unit: '条', note: '编辑笔记 18 次' },
      { label: '下载讲义', value: 5, unit: '份', note: '涉及 5 节课程' },
      { label: '新增收藏', value: 11, unit: '条', note: '月末收藏 31 条' },
      { label: '修正错题', value: 17, unit: '道', note: '重做正确率 71%' },
    ],
    highlights: ['最长连续学习6天，已初步建立稳定节奏', '社会工作目标章节掌握度提升15%', '完成17道错题修正，减少重复错误'],
    concerns: ['小组和社区工作方法掌握度不足50%', '有13天未学习，学习间隔相对分散'],
    nextSteps: ['将每周学习天数稳定在5天以上', '优先学习小组工作方法与社区工作方法精讲课', '每天完成15题，并在当天整理错题'],
  },
  {
    id: '2026-05', year: 2026, month: 5, status: 'ready', generatedAt: '2026-06-01 08:00',
    summary: '首份月度报告，完成备考起步',
    headline: '本月学习9天，完成128道题，开始建立知识体系',
    metrics: { studyDays: 9, minutes: 356, questions: 128, accuracy: 68, lessons: 4, knowledge: 11, masteryGain: 5, longestStreak: 3 },
    dailyQuestions: [0, 0, 12, 0, 15, 18, 0, 0, 12, 0, 0, 16, 20, 0, 0, 0, 13, 0, 0, 10, 0, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    subjects: [{ name: '综合能力', total: 68, correct: 48 }, { name: '实务', total: 42, correct: 27 }, { name: '法规政策', total: 18, correct: 12 }],
    chapters: [{ name: '社会工作目标', mastery: 62, change: 8 }, { name: '社会工作价值观', mastery: 51, change: 5 }, { name: '个案工作方法', mastery: 37, change: 3, weak: true }],
    tools: [{ label: '完成精讲课', value: 4, unit: '节', note: '完成率 40%' }, { label: '学习知识点', value: 11, unit: '个', note: '覆盖3个章节' }, { label: '新增笔记', value: 5, unit: '条', note: '编辑8次' }, { label: '下载讲义', value: 2, unit: '份', note: '涉及2节课程' }, { label: '新增收藏', value: 7, unit: '条', note: '月末收藏20条' }, { label: '修正错题', value: 6, unit: '道', note: '重做正确率67%' }],
    highlights: ['完成首月备考记录', '开始使用错题本和学习笔记'], concerns: ['学习天数偏少', '个案工作方法掌握不足'], nextSteps: ['每周至少学习4天', '完成基础章节精讲课'],
  },
]

export const getMonthlyReport = (id: string) => monthlyReports.find(item => item.id === id)

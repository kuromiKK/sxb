export type Subject = { id: string; name: string; progress: number; questions: number; color: string }

export const exam = {
  id: 'junior-social-worker', name: '初级社会工作师', examDate: '2027年5月13日', daysLeft: 307, mastery: 1,
  totalQuestions: 1680, totalKnowledge: 426, totalCourses: 86, level: '基础版', expiry: '2027年5月14日',
}

export const examCategories = [
  { id: 'social-work', name: '社会工作', icon: 'person', groups: [{ title: '社会工作者考试', exams: [{ id: 'junior-social-worker', name: '初级社会工作师', subtitle: '助理社会工作师', daysLeft: 307 }, { id: 'mid-social-worker', name: '中级社会工作师', subtitle: '社会工作师', daysLeft: 307 }] }] },
  { id: 'engineering', name: '工程建筑', icon: 'home', groups: [{ title: '建造工程', exams: [{ id: 'first-constructor', name: '一级建造师', subtitle: '建筑工程', daysLeft: 326 }, { id: 'second-constructor', name: '二级建造师', subtitle: '建筑工程', daysLeft: 286 }] }] },
  { id: 'finance', name: '财会经济', icon: 'wallet', groups: [{ title: '财会考试', exams: [{ id: 'junior-accounting', name: '初级会计职称', subtitle: '财会经济', daysLeft: 264 }, { id: 'economist', name: '中级经济师', subtitle: '经济专业', daysLeft: 347 }] }] },
  { id: 'education', name: '教师资格', icon: 'staff', groups: [{ title: '教师资格考试', exams: [{ id: 'primary-teacher', name: '小学教师资格', subtitle: '教师资格', daysLeft: 192 }, { id: 'middle-teacher', name: '中学教师资格', subtitle: '教师资格', daysLeft: 192 }] }] },
  { id: 'health', name: '医药卫生', icon: 'heart', groups: [{ title: '职业资格', exams: [{ id: 'pharmacist', name: '执业药师', subtitle: '医药卫生', daysLeft: 371 }, { id: 'nurse', name: '护士资格', subtitle: '医药卫生', daysLeft: 241 }] }] },
]

export const searchResults = [
  { id: 1, targetId: 'course-ability-section-1-1', type: 'course', typeName: '精讲课', title: '社会工作的目标、对象及主要领域', description: '社会工作综合能力 · 第一章 · 18分钟', keyword: '社会工作' },
  { id: 2, targetId: 'kp-1-1-1', type: 'knowledge', typeName: '知识点', title: '社会工作价值观与专业伦理', description: '核心知识点 · 关联18道题', keyword: '社会工作' },
  { id: 3, targetId: 'exam-guide', type: 'article', typeName: '文章', title: '初级社会工作师考试科目与报考说明', description: '考试指南 · 2026-08-08', keyword: '考试' },
  { id: 4, targetId: 'kp-ability-4-1-1', type: 'knowledge', typeName: '知识点', title: '个案工作的主要模式', description: '重点知识点 · 关联12道题', keyword: '个案' },
  { id: 5, targetId: 'course-practice-section-3-1', type: 'course', typeName: '精讲课', title: '社区工作的主要方法', description: '社会工作实务 · 第三章 · 26分钟', keyword: '社区' },
  { id: 6, targetId: 'time-management', type: 'article', typeName: '文章', title: '考前复习时间如何分配', description: '备考方法 · 2026-08-06', keyword: '复习' },
]

export const subjects: Subject[] = [
  { id: 'ability', name: '社会工作综合能力（初级）', progress: 42, questions: 286, color: '#3569e8' },
  { id: 'practice', name: '社会工作实务（初级）', progress: 18, questions: 324, color: '#e98a3a' },
]

export const question = {
  id: 'q-001', type: '单项选择题', stem: '社会工作者在服务过程中，应当尊重服务对象的自决权。下列做法中，最符合这一原则的是？',
  options: ['替服务对象做出最有利的决定', '向服务对象说明选择及后果后由其决定', '要求服务对象完全按照计划行动', '避免向服务对象提供任何建议'], answer: 1,
  explanation: '自决是指服务对象有权对自己的生活做出选择和决定。社会工作者应提供充分信息和必要支持，但不能代替服务对象做决定。', knowledge: '社会工作价值观与专业伦理', year: '2024',
}

export const courses = [
  { id: 1, type: '视频', title: '社会工作价值观与专业伦理', meta: '12:36 · 关联18道题', progress: 64 },
  { id: 2, type: '图文', title: '个案工作的主要模式', meta: '约8分钟 · 关联12道题', progress: 28 },
  { id: 3, type: '音频', title: '社会工作实务重点速记', meta: '28:10 · 重点知识图谱', progress: 0 },
]

export type KnowledgePoint = {
  id: string
  title: string
  stars: 1 | 2 | 3 | 4 | 5
  questionTotal: number
  questionDone: number
  mastery: number
  content: string
  courseTitle: string
  courseMeta: string
  note?: string
}

export type KnowledgeSection = { id: string; no: number; name: string; points: KnowledgePoint[] }
export type KnowledgeChapter = { id: string; no: number; name: string; sections: KnowledgeSection[] }
export type KnowledgeSubject = { id: string; name: string; mastery: number; questionDone: number; questionTotal: number; chapters: KnowledgeChapter[] }

const baseKnowledgeSubjects: KnowledgeSubject[] = [
  {
    id: 'ability', name: '社会工作综合能力（初级）', mastery: 42, questionDone: 286, questionTotal: 680,
    chapters: [
      {
        id: 'ability-chapter-1', no: 1, name: '社会工作服务的内涵', sections: [
          { id: 'ability-section-1-1', no: 1, name: '社会工作服务的目标与功能', points: [
            { id: 'kp-1-1-1', title: '社会层面的目标（解决社会问题、促进社会公平、助力社会治理、促进社会建设）', stars: 4, questionTotal: 18, questionDone: 8, mastery: 61, content: '社会工作的目标既面向服务对象，也面向社会整体。社会工作者通过专业服务回应社会问题，促进社会公平与社会融入，并在服务过程中协助社会治理和社会建设。', courseTitle: '社会工作的目标、对象及主要领域', courseMeta: '精讲课 · 18分钟' },
            { id: 'kp-1-1-2', title: '对服务对象的功能（促进正常生活、恢复社会功能、促进人的发展、促进人与环境适应）', stars: 3, questionTotal: 16, questionDone: 5, mastery: 42, content: '对服务对象而言，社会工作服务帮助其解决现实困难、恢复和增强社会功能，并通过资源链接与能力提升，促进个人发展以及人与环境之间的良性适应。', courseTitle: '社会工作服务对象与功能', courseMeta: '精讲课 · 16分钟' },
            { id: 'kp-1-1-3', title: '对社会的功能（维护社会秩序、建构社会资本、促进社会和谐、推动社会进步）', stars: 5, questionTotal: 20, questionDone: 14, mastery: 76, content: '社会工作通过专业服务和公众参与，增进信任与合作，维护社会秩序，促进社会和谐，并推动社会政策与社会服务持续改进。', courseTitle: '社会工作的社会功能', courseMeta: '精讲课 · 22分钟' },
          { id: 'kp-1-1-4', title: '社会工作者的主要角色（直接服务角色、间接服务角色与综合服务角色）', stars: 4, questionTotal: 24, questionDone: 11, mastery: 52, content: '社会工作者既可以直接为服务对象提供咨询、治疗、支持和资源链接，也可以承担行政管理、政策倡导、研究与督导等间接服务角色。', courseTitle: '社会工作者的角色', courseMeta: '精讲课 · 20分钟' },
        ] },
          { id: 'ability-section-1-2', no: 2, name: '社会工作的对象与领域', points: [
            { id: 'kp-1-2-1', title: '以人群划分的服务领域（儿童、青少年、老年人、妇女、残疾人、社会救助与退役军人等）', stars: 3, questionTotal: 18, questionDone: 3, mastery: 28, content: '社会工作可以按照服务人群划分领域，不同人群在成长、生活和社会参与中有不同需要，服务方案应体现人群特点和处境差异。', courseTitle: '社会工作服务领域', courseMeta: '精讲课 · 19分钟' },
            { id: 'kp-1-2-2', title: '以服务机构类型划分的服务领域（家庭、社区、学校、医院、企业与社会工作服务机构）', stars: 2, questionTotal: 14, questionDone: 2, mastery: 19, content: '社会工作服务也可以按照机构和场景划分。机构类型不同，服务对象、资源环境和专业任务也会有所差异。', courseTitle: '不同机构中的社会工作', courseMeta: '精讲课 · 14分钟' },
        ] },
      ],
      },
      {
        id: 'ability-chapter-2', no: 2, name: '社会工作发展的基本原则', sections: [
          { id: 'ability-section-2-1', no: 1, name: '坚持中国共产党的全面领导', points: [
            { id: 'kp-2-1-1', title: '党的全面领导是发展保障（党领导一切、社会主义制度下开展、健全体制机制的指引）', stars: 5, questionTotal: 22, questionDone: 17, mastery: 81, content: '社会工作发展坚持党的全面领导，坚持以人民为中心，完善体制机制和政策制度，为社会工作服务提供方向保障。', courseTitle: '社会工作发展的基本原则', courseMeta: '精讲课 · 23分钟' },
            { id: 'kp-2-1-2', title: '自觉接受党的领导（原则、项目设计体现政策、实施体现目标）', stars: 4, questionTotal: 16, questionDone: 9, mastery: 58, content: '社会工作服务要把党的领导落实到项目设计、服务实施、资源整合和效果评估的全过程。', courseTitle: '社会工作服务的政治方向', courseMeta: '精讲课 · 17分钟' },
          ] },
          { id: 'ability-section-2-2', no: 2, name: '坚持以习近平新时代中国特色社会主义思想为指导', points: [
            { id: 'kp-2-2-1', title: '思想的重要地位（马克思主义中国化时代化最新成果、实践基础与理论贡献）', stars: 3, questionTotal: 12, questionDone: 4, mastery: 35, content: '理解理论指导的时代背景、实践基础与核心要义，能够将其与社会工作服务的价值理念联系起来。', courseTitle: '理论指导与社会工作', courseMeta: '精讲课 · 15分钟' },
            { id: 'kp-2-2-2', title: '指导实践的要求（坚持党的领导、人民至上与发展成果共享）', stars: 4, questionTotal: 15, questionDone: 7, mastery: 49, content: '社会工作实践要坚持人民至上，把服务对象的获得感、幸福感和安全感作为重要评价依据。', courseTitle: '社会工作实践要求', courseMeta: '精讲课 · 16分钟' },
          ] },
        ],
      },
    ],
  },
  {
    id: 'practice', name: '社会工作实务（初级）', mastery: 18, questionDone: 76, questionTotal: 420,
    chapters: [
      { id: 'practice-chapter-1', no: 1, name: '社会工作实务通用过程', sections: [
        { id: 'practice-section-1-1', no: 1, name: '接案', points: [
          { id: 'kp-p-1-1-1', title: '接案的步骤和核心技巧（接案前准备、会谈、收集服务对象资料、做接案会谈记录）', stars: 5, questionTotal: 20, questionDone: 10, mastery: 55, content: '接案是社会工作实务过程的第一步，重点在于建立初步关系、了解求助者需要并判断是否适合进入服务。', courseTitle: '接案的步骤和核心技巧', courseMeta: '精讲课 · 21分钟' },
          { id: 'kp-p-1-1-2', title: '接案的注意事项（紧急介入、能力权衡、问题排序、服务范围匹配）', stars: 3, questionTotal: 14, questionDone: 2, mastery: 22, content: '接案过程中应识别紧急情况，评估自身能力和机构服务范围，并与服务对象共同确定问题处理的优先顺序。', courseTitle: '接案注意事项', courseMeta: '精讲课 · 14分钟' },
        ] },
        { id: 'practice-section-1-2', no: 2, name: '预估', points: [
          { id: 'kp-p-1-2-1', title: '预估的目的和任务', stars: 4, questionTotal: 17, questionDone: 6, mastery: 39, content: '预估是对服务对象的问题、需要、资源和环境进行系统了解，为后续目标制定与服务计划提供依据。', courseTitle: '预估的目的和任务', courseMeta: '精讲课 · 18分钟' },
        ] },
      ] },
    ],
  },
]

const generatedChapterNames: Record<string, string[]> = {
  ability: [
    '专业关系建立与发展', '价值观与专业伦理', '沟通与会谈技巧', '个案工作方法', '小组工作基础', '社区工作方法',
    '社会工作行政', '社会工作督导', '社会服务方案设计', '社会政策与法规', '社会工作研究方法', '社会救助服务',
    '家庭社会工作', '学校社会工作', '医务社会工作', '老年社会工作', '综合能力案例分析', '考前重点回顾',
  ],
  practice: [
    '接案与建立专业关系', '预估与问题分析', '服务计划与目标制定', '介入策略与服务实施', '评估与结案', '儿童社会工作实务',
    '青少年社会工作实务', '老年社会工作实务', '妇女社会工作实务', '残疾人社会工作实务', '家庭社会工作实务', '社区社会工作实务',
    '学校社会工作实务', '医务社会工作实务', '社会救助社会工作实务', '灾害社会工作实务', '综合案例实训', '考前重点回顾',
  ],
}

const generatedSectionNames = ['基本概念', '服务对象', '核心原则与方法', '实务流程中的关键判断', '常见问题与应对', '服务记录与成效评估', '典型案例分析', '跨专业协作与资源链接', '政策依据与边界', '考前重点梳理']
const generatedPointNames = [
  '概念辨析与核心要义', '服务目标和专业边界', '服务对象需求的识别与评估', '专业关系中的沟通策略',
  '服务方案设计的步骤与注意事项', '常见情境下的实务处理方法', '不同服务场景中的资源整合', '成效评估指标与记录要求',
]

const makeGeneratedChapter = (subjectId: string, chapterNo: number, chapterName: string): KnowledgeChapter => {
  const sectionCount = 5 + ((chapterNo * 3) % 6)
  const sections = Array.from({ length: sectionCount }, (_, sectionIndex) => {
    const sectionNo = sectionIndex + 1
    const baseName = generatedSectionNames[(chapterNo + sectionIndex) % generatedSectionNames.length]
    const sectionName = sectionIndex % 3 === 1 ? `${baseName}与服务场景中的综合应用` : baseName
    const points = Array.from({ length: 2 }, (_, pointIndex) => {
      const pointNo = pointIndex + 1
      const shortName = generatedPointNames[(chapterNo + sectionIndex + pointIndex) % generatedPointNames.length]
      const title = pointIndex === 1
        ? `${shortName}（结合${chapterName}的典型情境、工作步骤与易错判断）`
        : shortName
      const questionTotal = 8 + ((chapterNo + sectionIndex + pointIndex) % 15)
      const questionDone = (chapterNo * 2 + sectionIndex + pointIndex) % (questionTotal + 1)
      return {
        id: `kp-${subjectId}-${chapterNo}-${sectionNo}-${pointNo}`,
        title,
        stars: ((chapterNo + sectionIndex + pointIndex) % 5 + 1) as KnowledgePoint['stars'],
        questionTotal,
        questionDone,
        mastery: 18 + ((chapterNo * 7 + sectionIndex * 9 + pointIndex * 11) % 70),
        content: `${chapterName}中的${sectionName}，需要结合服务对象的实际处境理解专业要求，并注意服务流程、沟通方式和记录规范之间的联系。`,
        courseTitle: `${chapterName}：${shortName}`,
        courseMeta: `精讲课 · ${12 + ((chapterNo + sectionIndex) % 18)}分钟`,
      }
    })
    return { id: `${subjectId}-section-${chapterNo}-${sectionNo}`, no: sectionNo, name: sectionName, points }
  })
  return { id: `${subjectId}-chapter-${chapterNo}`, no: chapterNo, name: chapterName, sections }
}

export const knowledgeSubjects: KnowledgeSubject[] = baseKnowledgeSubjects.map(subject => ({
  ...subject,
  chapters: [
    ...subject.chapters,
    ...generatedChapterNames[subject.id].slice(2).map((name, index) => {
      const chapterNo = index + 3
      const title = chapterNo % 2 === 0 ? name : `${name}与服务实践中的重点应用`
      return makeGeneratedChapter(subject.id, chapterNo, title)
    }),
  ],
}))

export type CourseType = 'video' | 'audio' | 'article'
export type CourseLesson = {
  id: string
  title?: string
  knowledgePointId?: string
  subjectId: string
  subjectName: string
  chapterId: string
  chapterNo: number
  chapterName: string
  sectionId: string
  sectionNo: number
  sectionName: string
  type: CourseType
  typeName: string
  intro: string
  totalMinutes: number
  canTrial: boolean
  hasHandout: boolean
  handoutName: string
  progress: number
  currentMinute: number
  completed: boolean
}

type CourseConfig = Pick<CourseLesson, 'type' | 'intro' | 'totalMinutes' | 'canTrial' | 'hasHandout' | 'handoutName' | 'progress' | 'currentMinute' | 'completed'>

const courseTypeNames: Record<CourseType, string> = { video: '视频', audio: '音频', article: '图文' }
const findSectionRecord = (sectionId: string) => {
  for (const subject of knowledgeSubjects) {
    for (const chapter of subject.chapters) {
      const section = chapter.sections.find(item => item.id === sectionId)
      if (section) return { subject, chapter, section }
    }
  }
  return undefined
}

const makeCourse = (sectionId: string, config: CourseConfig): CourseLesson => {
  const record = findSectionRecord(sectionId)
  if (!record) throw new Error(`Course section not found: ${sectionId}`)
  return {
    id: `course-${sectionId}`,
    subjectId: record.subject.id,
    subjectName: record.subject.name,
    chapterId: record.chapter.id,
    chapterNo: record.chapter.no,
    chapterName: record.chapter.name,
    sectionId: record.section.id,
    sectionNo: record.section.no,
    sectionName: record.section.name,
    typeName: courseTypeNames[config.type],
    ...config,
  }
}

export const courseCatalog: CourseLesson[] = [
  makeCourse('ability-section-1-1', { type: 'video', intro: '从服务目标、对象和社会功能三个角度，建立社会工作服务的整体认识。本节将结合考试常见表述，梳理服务对象改变、社会关系改善与社会功能恢复之间的联系，并通过典型情境帮助你判断不同目标的适用范围。学完后可以形成清晰的答题框架，为后续学习社会工作价值观和专业方法打好基础。', totalMinutes: 42, canTrial: true, hasHandout: true, handoutName: '社会工作服务目标与功能讲义.pdf', progress: 64, currentMinute: 27, completed: false }),
  makeCourse('ability-section-1-2', { type: 'audio', intro: '梳理社会工作的服务对象与主要领域，帮助你快速建立考试范围地图。', totalMinutes: 28, canTrial: true, hasHandout: false, handoutName: '', progress: 0, currentMinute: 0, completed: false }),
  makeCourse('ability-section-2-1', { type: 'article', intro: '理解社会工作发展的基本原则，掌握政策方向与专业实践之间的联系。', totalMinutes: 23, canTrial: false, hasHandout: true, handoutName: '社会工作发展的基本原则.pdf', progress: 0, currentMinute: 0, completed: false }),
  makeCourse('ability-section-3-1', { type: 'video', intro: '围绕专业关系建立与发展，学习实务沟通中的关键判断和应对方法。', totalMinutes: 36, canTrial: false, hasHandout: true, handoutName: '专业关系建立与发展讲义.pdf', progress: 18, currentMinute: 7, completed: false }),
  makeCourse('ability-section-4-1', { type: 'article', intro: '掌握个案工作方法的基本框架，理解不同服务情境下的选择逻辑。', totalMinutes: 31, canTrial: true, hasHandout: false, handoutName: '', progress: 100, currentMinute: 31, completed: true }),
  makeCourse('practice-section-1-1', { type: 'video', intro: '从接案前准备到接案会谈记录，完整掌握通用实务过程的第一步。', totalMinutes: 46, canTrial: true, hasHandout: true, handoutName: '接案步骤与技巧讲义.pdf', progress: 36, currentMinute: 16, completed: false }),
  makeCourse('practice-section-1-2', { type: 'article', intro: '学习如何识别问题、评估需要与资源，为服务计划制定打下基础。', totalMinutes: 24, canTrial: false, hasHandout: true, handoutName: '预估的目的和任务.pdf', progress: 0, currentMinute: 0, completed: false }),
  makeCourse('practice-section-3-1', { type: 'audio', intro: '用音频快速复盘服务计划与目标制定，适合通勤和碎片时间学习。', totalMinutes: 19, canTrial: true, hasHandout: false, handoutName: '', progress: 0, currentMinute: 0, completed: false }),
]

export type PracticeQuestionType = 'single' | 'multiple' | 'configured'
export type PracticeQuestion = {
  id: string
  subjectId: string
  subjectName: string
  chapterId: string
  chapterName: string
  sectionId: string
  sectionName: string
  type: PracticeQuestionType
  typeName: string
  year: string
  source: string
  difficulty: '基础' | '中等' | '重点'
  stem: string
  options: string[]
  answer: number[]
  explanation: string
  knowledgePointId: string
  knowledgePointIds?: string[]
  linkedSubjectIds?: string[]
  linkedChapterIds?: string[]
  linkedSectionIds?: string[]
  knowledgePointTitle: string
}

const abilitySubjectName = '社会工作综合能力（初级）'
const practiceSubjectName = '社会工作实务（初级）'
const questionExplanationDetails: Record<string, string> = {
  'q-001': '本题考查社会工作价值观中的服务对象自决。自决并不等于社会工作者完全退出服务，而是要求社会工作者先用服务对象能够理解的方式说明可选方案、可能后果和相关风险，在提供专业支持的基础上，由服务对象作出最终决定。选项A和C都由社会工作者替代或强迫服务对象作出选择，削弱了服务对象的主体地位；选项D则把尊重自决误解为不提供任何专业意见，同样没有履行告知和支持责任。需要注意的是，当服务对象的决定可能危及本人或他人安全、违反法律规定，或者服务对象暂时缺乏相应决定能力时，自决原则也会受到必要限制，社会工作者应结合伦理守则、风险评估和机构程序审慎处理。因此，先充分告知并提供支持，再由服务对象自主决定，是最符合题意的做法。',
  'q-002': '判断这类题时，要区分“帮助服务对象提升能力”和“替服务对象包办责任”。促进正常生活、恢复社会功能、促进人的发展，都是社会工作通过资源链接、能力建设和环境改善实现的专业功能。替代服务对象承担全部责任会削弱其自主性和解决问题的能力，不符合助人自助的专业理念，因此不能选。',
  'q-003': '社会工作服务领域既可以按照儿童、青少年、老年人、妇女、残疾人等服务人群划分，也可以按照学校、医务、企业、社区和司法等服务场景划分。其服务对象并不局限于某一种职业或少数专业人员。后三个选项都使用了“只面向”的绝对化表述，明显缩小了社会工作的实际服务范围。',
  'q-004': '党的全面领导决定社会工作发展的根本方向，并通过组织体系、政策制度和工作机制提供保障。坚持以人民为中心，是社会工作开展服务、回应群众需要的价值立场。明确发展方向、完善体制机制和落实相关政策制度均属于具体体现；脱离政策制度独立开展服务既不符合实际工作要求，也无法形成稳定、规范的服务保障，因此不能选择。',
  'q-005': '接案是社会工作实务过程的起点，但正式会谈之前仍需完成必要准备。社会工作者应先了解求助者的来源、基本问题和求助意愿，核对机构的服务范围，并准备会谈环境和相关资料。服务计划需要在接案、预估和目标协商之后制定，不能在尚未了解情况时直接完成；立即结案或替服务对象包办资源也违背专业工作程序。',
  'q-006': '接案会谈既要了解服务对象为什么求助、希望解决什么问题，也要判断其需要是否与机构服务范围相匹配。社会工作者还应说明服务方式、保密原则、双方权利义务和必要边界，以便建立清晰、稳定的专业关系。不说明服务边界会增加误解和伦理风险，因此该项不属于正确做法。',
  'q-007': '积极倾听不仅是听清服务对象说出的事实，还要理解其语言背后的感受、需要和期待，并通过澄清、摘要和情感回应确认理解是否准确。这样有助于建立信任，鼓励服务对象继续表达，并为后续预估和介入提供可靠信息。替服务对象作决定、压缩表达时间或回避情绪，都与积极倾听的目的相反。',
  'q-008': '预估强调从问题、需要、优势、资源和环境多个层面系统收集与分析资料，并与服务对象共同确认需要优先处理的事项。预估结果是确定服务目标、选择介入策略和制定服务计划的重要依据。只关注缺点会忽视服务对象的优势与支持网络，跳过资料收集则容易导致目标失准；服务成效评价通常发生在介入实施之后。',
}
const makePracticeQuestion = (question: Omit<PracticeQuestion, 'typeName'>): PracticeQuestion => ({
  ...question,
  typeName: question.type === 'single' ? '单选题' : '多选题',
  explanation: `${question.explanation}${questionExplanationDetails[question.id] || ''}`,
})

export const practiceQuestions: PracticeQuestion[] = [
  makePracticeQuestion({ id: 'q-001', subjectId: 'ability', subjectName: abilitySubjectName, chapterId: 'ability-chapter-1', chapterName: '社会工作服务的内涵', sectionId: 'ability-section-1-1', sectionName: '社会工作服务的目标与功能', type: 'single', year: '2024', source: '全国真题', difficulty: '基础', stem: '社会工作者在服务过程中，应当尊重服务对象的自决权。下列做法中，最符合这一原则的是？', options: ['替服务对象做出最有利的决定', '向服务对象说明选择及后果后由其决定', '要求服务对象完全按照计划行动', '避免向服务对象提供任何建议'], answer: [1], explanation: '自决是指服务对象有权对自己的生活做出选择和决定。社会工作者应提供充分信息和必要支持，但不能代替服务对象做决定。', knowledgePointId: 'kp-1-1-1', knowledgePointTitle: '社会层面的目标与社会工作服务功能' }),
  makePracticeQuestion({ id: 'q-002', subjectId: 'ability', subjectName: abilitySubjectName, chapterId: 'ability-chapter-1', chapterName: '社会工作服务的内涵', sectionId: 'ability-section-1-1', sectionName: '社会工作服务的目标与功能', type: 'multiple', year: '2023', source: '全国真题', difficulty: '重点', stem: '社会工作对服务对象的功能主要包括哪些方面？', options: ['促进正常生活', '恢复社会功能', '促进人的发展', '替代服务对象承担全部责任'], answer: [0, 1, 2], explanation: '社会工作对服务对象的功能包括促进正常生活、恢复社会功能、促进人的发展以及促进人与环境相适应。社会工作强调支持和赋能，不是替代服务对象承担全部责任。', knowledgePointId: 'kp-1-1-2', knowledgePointTitle: '对服务对象的功能' }),
  makePracticeQuestion({ id: 'q-003', subjectId: 'ability', subjectName: abilitySubjectName, chapterId: 'ability-chapter-1', chapterName: '社会工作服务的内涵', sectionId: 'ability-section-1-2', sectionName: '社会工作的对象与领域', type: 'single', year: '2022', source: '全国真题', difficulty: '基础', stem: '下列人群中，属于社会工作常见服务领域的是？', options: ['儿童与青少年', '只面向企业管理者', '只面向专业研究人员', '只面向社会工作者'], answer: [0], explanation: '社会工作服务领域可以按照服务人群划分，包括儿童、青少年、老年人、妇女、残疾人等，也可以按照机构和服务场景划分。', knowledgePointId: 'kp-1-2-1', knowledgePointTitle: '以人群划分的服务领域' }),
  makePracticeQuestion({ id: 'q-004', subjectId: 'ability', subjectName: abilitySubjectName, chapterId: 'ability-chapter-2', chapterName: '社会工作发展的基本原则', sectionId: 'ability-section-2-1', sectionName: '坚持中国共产党的全面领导', type: 'multiple', year: '2025', source: '全国真题', difficulty: '重点', stem: '社会工作发展坚持党的全面领导，主要体现在哪些方面？', options: ['明确发展方向', '完善体制机制和政策制度', '坚持以人民为中心', '脱离政策制度独立开展服务'], answer: [0, 1, 2], explanation: '党的全面领导为社会工作发展提供方向保障、制度保障和组织保障，社会工作服务应坚持以人民为中心并落实相关政策制度。', knowledgePointId: 'kp-2-1-1', knowledgePointTitle: '党的全面领导是发展保障' }),
  makePracticeQuestion({ id: 'q-005', subjectId: 'practice', subjectName: practiceSubjectName, chapterId: 'practice-chapter-1', chapterName: '社会工作实务通用过程', sectionId: 'practice-section-1-1', sectionName: '接案', type: 'single', year: '2024', source: '全国真题', difficulty: '基础', stem: '社会工作者接案前首先需要完成的工作是？', options: ['制订完整服务计划', '了解求助者来源和性质并做好准备', '立即结束服务关系', '直接替服务对象联系所有资源'], answer: [1], explanation: '接案前准备包括了解求助者的来源、类型、问题和需要，了解机构服务范围，并准备会谈所需资料。', knowledgePointId: 'kp-p-1-1-1', knowledgePointTitle: '接案的步骤和核心技巧' }),
  makePracticeQuestion({ id: 'q-006', subjectId: 'practice', subjectName: practiceSubjectName, chapterId: 'practice-chapter-1', chapterName: '社会工作实务通用过程', sectionId: 'practice-section-1-1', sectionName: '接案', type: 'multiple', year: '2023', source: '全国真题', difficulty: '重点', stem: '接案会谈中，社会工作者需要重点关注哪些内容？', options: ['服务对象的求助愿望', '服务对象的问题和需要', '机构能够提供的服务范围', '不向服务对象说明服务边界'], answer: [0, 1, 2], explanation: '接案会谈要了解服务对象的求助愿望、问题和需要，同时说明机构服务范围、工作过程和双方权利义务，建立初步专业关系。', knowledgePointId: 'kp-p-1-1-2', knowledgePointTitle: '接案的注意事项' }),
  makePracticeQuestion({ id: 'q-007', subjectId: 'ability', subjectName: abilitySubjectName, chapterId: 'ability-chapter-3', chapterName: '沟通与会谈技巧', sectionId: 'ability-section-3-1', sectionName: '专业关系建立与发展', type: 'single', year: '2021', source: '全国真题', difficulty: '中等', stem: '社会工作者在会谈中使用积极倾听，最主要的作用是？', options: ['尽快替服务对象作决定', '准确理解服务对象的感受和需要', '减少服务对象表达时间', '避免回应服务对象的情绪'], answer: [1], explanation: '积极倾听有助于社会工作者准确理解服务对象表达的内容、情绪和需要，是建立信任和专业关系的重要基础。', knowledgePointId: 'kp-ability-3-1-1', knowledgePointTitle: '专业关系中的沟通策略' }),
  makePracticeQuestion({ id: 'q-008', subjectId: 'practice', subjectName: practiceSubjectName, chapterId: 'practice-chapter-2', chapterName: '预估与问题分析', sectionId: 'practice-section-2-1', sectionName: '预估', type: 'single', year: '2022', source: '全国真题', difficulty: '中等', stem: '预估阶段的重要任务是？', options: ['全面了解服务对象的问题、需要、资源和环境', '立即评价服务成效', '只记录服务对象的缺点', '跳过资料收集直接结案'], answer: [0], explanation: '预估是对服务对象的问题、需要、资源和环境进行系统了解，为确定服务目标和制定服务计划提供依据。', knowledgePointId: 'kp-p-1-2-1', knowledgePointTitle: '预估的目的和任务' }),
]

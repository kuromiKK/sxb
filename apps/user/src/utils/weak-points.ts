import { practiceQuestions, type PracticeQuestion } from '@/mock/data'
import { getAnswered } from '@/utils/practice-plan'

export type WeakPointDebugState = 'normal' | 'weak-demo' | 'weak-empty'

export type WeakKnowledgePoint = {
  id: string
  title: string
  total: number
  correct: number
  accuracy: number
  questions: PracticeQuestion[]
}

const groupByKnowledgePoint = (questions: PracticeQuestion[]) => {
  const groups = new Map<string, PracticeQuestion[]>()
  questions.forEach((question) => {
    const group = groups.get(question.knowledgePointId) || []
    group.push(question)
    groups.set(question.knowledgePointId, group)
  })
  return groups
}

export const getWeakKnowledgePoints = (
  examId: string,
  debugState: WeakPointDebugState = 'normal',
  questions: PracticeQuestion[] = practiceQuestions,
): WeakKnowledgePoint[] => {
  if (debugState === 'weak-empty') return []

  const answers = getAnswered(examId)
  const points = Array.from(groupByKnowledgePoint(questions).entries()).map(([id, pointQuestions]) => {
    const correct = pointQuestions.filter(question => answers[question.id] === 'correct').length
    return {
      id,
      title: pointQuestions[0].knowledgePointTitle,
      total: pointQuestions.length,
      correct,
      accuracy: correct / pointQuestions.length,
      completed: pointQuestions.every(question => Boolean(answers[question.id])),
      questions: pointQuestions,
    }
  })

  if (debugState === 'weak-demo') {
    const demo = points[0]
    return demo ? [{ ...demo, correct: 0, accuracy: 0 }] : []
  }

  return points
    .filter(point => point.completed && point.accuracy < 0.5)
    .sort((a, b) => a.accuracy - b.accuracy)
    .map(({ completed: _completed, ...point }) => point)
}

export const getWeakQuestions = (
  examId: string,
  debugState: WeakPointDebugState = 'normal',
  questions: PracticeQuestion[] = practiceQuestions,
) => {
  const ids = new Set<string>()
  return getWeakKnowledgePoints(examId, debugState, questions)
    .flatMap(point => point.questions)
    .filter((question) => {
      if (ids.has(question.id)) return false
      ids.add(question.id)
      return true
    })
}

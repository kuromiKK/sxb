import { account, token } from '@/services/api'
type CourseRightsLevel = 'none' | 'basic' | 'trial' | 'pro' | 'flagship'
export type CourseAccessLevel = 'none' | 'trial' | 'full'

export const courseDebugOptions = [
  { key: 'logged-out', label: '未登录账号' },
  { key: 'no-access', label: '已登录无权限账号' },
  { key: 'trial', label: '1元试听权限账号' },
  { key: 'full', label: '旗舰版完整权限账号' },
]

export const getCourseAccessLevel = (): CourseAccessLevel => {
  const rights = (token() && account.level !== 'free' ? 'pro' : 'none') as CourseRightsLevel
  if (rights === 'trial') return 'trial'
  if (rights === 'pro' || rights === 'flagship') return 'full'
  return 'none'
}

export const hasFullCourseAccess = () => getCourseAccessLevel() === 'full'

export const canAccessCourse = (canTrial: boolean) => {
  const access = getCourseAccessLevel()
  return access === 'full' || (access === 'trial' && canTrial)
}

export const applyCourseDebugAccount = (
  key: string,
  login: (identity: string) => void,
  logout: () => void,
) => {
  uni.showToast({ title: '请使用测试订单验证权限，不能在前台授予会员', icon: 'none' })
  return getCourseAccessLevel()
  /* Legacy presentation states cannot grant server permissions.
  if (key === 'logged-out') {
    uni.setStorageSync('sxb-demo-rights', 'none')
    logout()
    return 'none' as CourseAccessLevel
  }

  login('course-debug')
  const rights: CourseRightsLevel = key === 'trial' ? 'trial' : key === 'full' ? 'flagship' : 'none'
  uni.setStorageSync('sxb-demo-rights', rights)
  return getCourseAccessLevel()
  */
}

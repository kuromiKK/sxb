<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
import { refreshCatalog } from '@/services/catalog'
import { refreshRights, refreshPersonalData, showApiError, token } from '@/services/api'
import { finishLearningBootstrap } from '@/utils/learning-bootstrap'
import {refreshSiteSettings} from '@/services/site-settings'
import { safePageUrl } from '@/utils/navigation'

onLaunch((options) => {
  const initialPath=options?.path?'/'+options.path.replace(/^\//,''):'/pages/index/index'
  const initialQuery=new URLSearchParams(options?.query||{}).toString()
  const initialRoute=initialPath+(initialQuery?'?'+initialQuery:'')
  // Preview never boots a student account, catalog, rights, or personal learning data.
  if(initialPath==='/pages/content-preview/index') { finishLearningBootstrap();return }
  void refreshSiteSettings().catch(()=>{})
  // Public entry pages work immediately. Prepare learning data in the background without recreating their forms.
  const publicEntry=['/pages/search/index','/pages/login/index'].includes(initialPath)||(initialPath==='/pages/profile-center/index'&&['about','agreement','privacy'].includes(String(options?.query?.mode||'')))
  if(!publicEntry)uni.showLoading({ title: '加载中' })
  void refreshCatalog().then(() => refreshRights().catch(error => { if (token()) throw error })).then(refreshPersonalData).then(() => {
    if(publicEntry){finishLearningBootstrap();return}
    const pages = getCurrentPages()
    const current = pages[pages.length - 1] as any
    const route = current?.$page?.fullPath || initialRoute
    // Do not clear a route the user already opened while initialization was running.
    if (pages.length !== 1 || '/' + current?.route !== initialPath) { finishLearningBootstrap(); return }
    uni.redirectTo({ url: safePageUrl(route), complete: finishLearningBootstrap })
  }).catch(error => {
    finishLearningBootstrap()
    if(publicEntry)return
    showApiError(error)
    uni.showModal({ title: '学习数据未能加载', content: '当前显示内容尚未同步，不能作为真实学习数据。请确认本地服务正在运行后重试。', showCancel: false, confirmText: '知道了' })
  }).finally(() => {if(!publicEntry)uni.hideLoading()})
})
</script>

<style>
html, body, #app { margin: 0; min-height: 100%; background: #eceff1; scrollbar-width: none; }
html::-webkit-scrollbar, body::-webkit-scrollbar, #app::-webkit-scrollbar { display: none; width: 0; height: 0; }
page { background: #f5f7fa; color: #182230; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; scrollbar-width: none; }
page::-webkit-scrollbar { display: none; width: 0; height: 0; }
uni-page-body { max-width: 430px; min-height: 100vh; margin: 0 auto; background: #f5f7fa; scrollbar-width: none; }
uni-page-body::-webkit-scrollbar { display: none; width: 0; height: 0; }
view, text, button { box-sizing: border-box; }
</style>

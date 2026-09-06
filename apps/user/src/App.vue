<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'

onLaunch(() => {
  console.log('上行宝用户端启动')
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

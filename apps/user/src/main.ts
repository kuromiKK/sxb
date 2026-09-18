import { createSSRApp } from 'vue'
import App from './App.vue'
import './styles/index.scss'
import './styles/system.scss'
import './styles/dialogs.scss'
import { showApiError } from '@/services/api'
import { installNavigation } from '@/utils/navigation'

export function createApp() {
  installNavigation()
  const app = createSSRApp(App)
  app.config.errorHandler = error => { console.error(error); showApiError(error) }
  return { app }
}

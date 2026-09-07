import { createSSRApp } from 'vue'
import App from './App.vue'
import './styles/index.scss'
import './styles/system.scss'
import { showApiError } from '@/services/api'

export function createApp() {
  const app = createSSRApp(App)
  app.config.errorHandler = error => { console.error(error); showApiError(error) }
  return { app }
}

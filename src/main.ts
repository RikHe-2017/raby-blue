import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/element-theme.scss'
import './style.css'
import App from './App.vue'
import { i18n } from './locales'

const app = createApp(App)

app.use(createPinia())
app.use(i18n)

app.mount('#app')

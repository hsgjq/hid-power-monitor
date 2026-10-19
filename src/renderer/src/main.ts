import { createApp } from 'vue'
import App from './App.vue'
// 全站样式只这一份，组件里不再各自 scoped，避免同一套色值散在多处改不全
import './assets/main.css'

createApp(App).mount('#app')

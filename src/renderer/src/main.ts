import { createApp } from 'vue'
import App from './App.vue'
import StripView from './StripView.vue'
// 按块分文件：变量 → 基础 → 弹层外壳 → 设备行 → 设置 → 浮条（顺序即层叠优先级）
import './styles/tokens.css'
import './styles/base.css'
import './styles/panel.css'
import './styles/device.css'
import './styles/settings.css'
import './styles/strip.css'

/*
 * 一个 HTML 入口挂两个视图：托盘弹层和桌面浮条。
 * 浮条是主进程用 `#strip` 这个 hash 打开的同一个文件，省掉第二套构建配置。
 */
const isStrip = window.location.hash === '#strip'
if (isStrip) document.documentElement.dataset.view = 'strip'

createApp(isStrip ? StripView : App).mount('#app')

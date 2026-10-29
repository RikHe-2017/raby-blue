import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import Icons from 'unplugin-icons/vite'
import IconsResolver from 'unplugin-icons/resolver'
import manifest from './manifest.config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const pathSrc = resolve(__dirname, 'src')

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => ({
  plugins: [
    crx({ manifest }),
    vue(),
    AutoImport({
      // Auto import functions from Vue, e.g. ref, reactive, toRef...
      // 自动导入 Vue 相关函数，如：ref, reactive, toRef 等
      imports: ['vue'],
      // Auto import functions from Element Plus, e.g. ElMessage, ElMessageBox... (with style)
      // 自动导入 Element Plus 相关函数，如：ElMessage, ElMessageBox... (带样式)
      resolvers: [
        ElementPlusResolver(),
        // Auto import icon components
        // 自动导入图标组件
        IconsResolver({
          prefix: 'Icon'
        })
      ],
      dts: resolve(pathSrc, 'auto-imports.d.ts')
    }),
    Components({
      resolvers: [
        // Auto register icon components
        // 自动注册图标组件
        IconsResolver({
          enabledCollections: ['ep']
        }),
        // Auto register Element Plus components
        // 自动导入 Element Plus 组件
        ElementPlusResolver()
      ],
      dts: resolve(pathSrc, 'components.d.ts')
    }),
    Icons({
      autoInstall: true
    })
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },

  build: {
    outDir: command === 'serve' ? 'dist-dev' : 'dist',
    sourcemap: mode === 'development'
  },
  server: {
    port: 5174,
    strictPort: true
  }
}))

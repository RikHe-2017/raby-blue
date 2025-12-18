import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { createRequire } from 'module'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import Icons from 'unplugin-icons/vite'
import IconsResolver from 'unplugin-icons/resolver'

const require = createRequire(import.meta.url)
const monacoEditorPluginModule = require('vite-plugin-monaco-editor')
const monacoEditorPlugin = monacoEditorPluginModule.default || monacoEditorPluginModule

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const pathSrc = resolve(__dirname, 'src')

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    monacoEditorPlugin({}),
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
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'index.html'),
        background: resolve(__dirname, 'src/background.ts')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    },
    sourcemap: process.env.NODE_ENV === 'development'
  },
  optimizeDeps: {
    include: ['monaco-editor']
  }
})

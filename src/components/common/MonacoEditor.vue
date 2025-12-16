<script lang="ts" setup>
  import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
  import * as monaco from 'monaco-editor'
  import type { editor } from 'monaco-editor'

  interface Props {
    modelValue: string
    language?: 'javascript' | 'json'
    theme?: 'vs' | 'vs-dark' | 'hc-black'
    height?: string
    readOnly?: boolean
    options?: editor.IStandaloneEditorConstructionOptions
  }

  interface Emits {
    (e: 'update:modelValue', value: string): void
    (e: 'input', value: string): void
    (e: 'change', value: string): void
  }

  const props = withDefaults(defineProps<Props>(), {
    language: 'javascript',
    theme: 'vs',
    height: '400px',
    readOnly: false,
    options: () => ({})
  })

  const emit = defineEmits<Emits>()

  const editorContainer = ref<HTMLDivElement>()
  let editorInstance: editor.IStandaloneCodeEditor | null = null

  // 配置JavaScript语言服务以启用代码补全
  const configureLanguageService = () => {
    if (props.language === 'javascript') {
      try {
        const tsLang = monaco.languages.typescript as any

        if (tsLang && tsLang.javascriptDefaults) {
          // 设置编译器选项
          tsLang.javascriptDefaults.setCompilerOptions({
            target: tsLang.ScriptTarget?.ES2020 || 5,
            allowNonTsExtensions: true,
            moduleResolution: tsLang.ModuleResolutionKind?.NodeJs || 2,
            module: tsLang.ModuleKind?.ESNext || 99,
            noEmit: true,
            esModuleInterop: true,
            allowJs: true,
            checkJs: false
          })

          // 设置诊断选项
          tsLang.javascriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: false,
            noSyntaxValidation: false
          })

          // 添加常用的全局类型定义
          const libSource = `
            declare var console: {
              log(...args: any[]): void;
              error(...args: any[]): void;
              warn(...args: any[]): void;
              info(...args: any[]): void;
            };
            declare var window: Window & typeof globalThis;
            declare var document: Document;
            declare var localStorage: Storage;
            declare var sessionStorage: Storage;
            declare var setTimeout: (callback: () => void, ms?: number) => number;
            declare var setInterval: (callback: () => void, ms?: number) => number;
            declare var clearTimeout: (id: number) => void;
            declare var clearInterval: (id: number) => void;
          `
          const libUri = 'ts:filename/global.d.ts'
          tsLang.javascriptDefaults.addExtraLib(libSource, libUri)
        }
      } catch (error) {
        console.warn('Monaco Editor language service configuration failed:', error)
      }
    }
  }

  // 默认编辑器配置
  const getDefaultOptions = (): editor.IStandaloneEditorConstructionOptions => {
    const baseOptions: editor.IStandaloneEditorConstructionOptions = {
      value: props.modelValue || '',
      language: props.language,
      theme: props.theme,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      lineNumbers: 'on',
      roundedSelection: false,
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      formatOnPaste: true,
      formatOnType: false,
      tabSize: 2,
      insertSpaces: true,
      folding: true,
      foldingStrategy: 'indentation',
      showFoldingControls: 'always',
      renderWhitespace: 'selection',
      renderLineHighlight: 'all',
      selectOnLineNumbers: true,
      matchBrackets: 'always',
      autoIndent: 'full',
      readOnly: props.readOnly,
      contextmenu: true,
      mouseWheelZoom: false,
      multiCursorModifier: 'ctrlCmd',
      accessibilitySupport: 'auto'
    }

    // JavaScript 特定配置
    if (props.language === 'javascript') {
      baseOptions.suggestOnTriggerCharacters = true
      baseOptions.quickSuggestions = {
        other: true,
        comments: false,
        strings: true
      }
      baseOptions.quickSuggestionsDelay = 100
      baseOptions.acceptSuggestionOnEnter = 'on'
      baseOptions.acceptSuggestionOnCommitCharacter = true
      baseOptions.snippetSuggestions = 'top'
      baseOptions.wordBasedSuggestions = 'matchingDocuments'
      baseOptions.parameterHints = {
        enabled: true
      }
      baseOptions.hover = {
        enabled: true
      }
      baseOptions.inlineSuggest = {
        enabled: false
      }
    }

    // JSON 特定配置
    if (props.language === 'json') {
      baseOptions.formatOnPaste = true
      baseOptions.formatOnType = true
    }

    // 合并用户自定义选项
    return { ...baseOptions, ...props.options }
  }

  onMounted(async () => {
    await nextTick()
    if (editorContainer.value) {
      // 配置语言服务
      configureLanguageService()

      // 创建Monaco Editor实例
      editorInstance = monaco.editor.create(editorContainer.value, getDefaultOptions())

      // 监听内容变化
      editorInstance.onDidChangeModelContent(() => {
        const value = editorInstance?.getValue() || ''
        emit('update:modelValue', value)
        emit('input', value)
        emit('change', value)
      })

      // 监听外部值变化
      watch(
        () => props.modelValue,
        newValue => {
          if (editorInstance && editorInstance.getValue() !== newValue) {
            editorInstance.setValue(newValue || '')
          }
        }
      )

      // 监听语言变化
      watch(
        () => props.language,
        () => {
          if (editorInstance) {
            monaco.editor.setModelLanguage(editorInstance.getModel()!, props.language)
          }
        }
      )

      // 监听主题变化
      watch(
        () => props.theme,
        newTheme => {
          if (editorInstance) {
            monaco.editor.setTheme(newTheme)
          }
        }
      )
    }
  })

  onBeforeUnmount(() => {
    if (editorInstance) {
      editorInstance.dispose()
      editorInstance = null
    }
  })

  // 格式化代码
  const format = () => {
    if (editorInstance) {
      editorInstance.getAction('editor.action.formatDocument')?.run()
    }
  }

  // 获取编辑器实例（供父组件使用）
  const getEditor = () => {
    return editorInstance
  }

  // 暴露方法给父组件
  defineExpose({
    format,
    getEditor
  })
</script>

<template>
  <div ref="editorContainer" class="monaco-editor" :style="{ height: height }" />
</template>

<style lang="scss" scoped>
  .monaco-editor {
    width: 100%;
    border: 1px solid var(--el-border-color);
    border-radius: var(--el-border-radius-base);
    overflow: hidden;
  }
</style>

<script lang="ts" setup>
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { Compartment, EditorState } from '@codemirror/state'
  import {
    EditorView,
    drawSelection,
    highlightActiveLine,
    highlightActiveLineGutter,
    highlightSpecialChars,
    keymap,
    lineNumbers
  } from '@codemirror/view'
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
  import {
    bracketMatching,
    defaultHighlightStyle,
    foldGutter,
    foldKeymap,
    indentOnInput,
    indentUnit,
    syntaxHighlighting
  } from '@codemirror/language'
  import {
    autocompletion,
    closeBrackets,
    closeBracketsKeymap,
    completionKeymap
  } from '@codemirror/autocomplete'
  import { javascript } from '@codemirror/lang-javascript'
  import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
  import { formatCode } from '../../utils/format-code'

  const props = withDefaults(
    defineProps<{
      modelValue: string
      height?: string
      readOnly?: boolean
    }>(),
    {
      height: '400px',
      readOnly: false
    }
  )

  const emit = defineEmits<{
    (event: 'update:modelValue', value: string): void
    (event: 'input', value: string): void
    (event: 'change', value: string): void
  }>()

  const editorContainer = ref<HTMLDivElement>()
  const readOnlyConfig = new Compartment()
  let editorView: EditorView | null = null

  const readOnlyExtensions = (readOnly: boolean) => [
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly)
  ]

  const createEditorState = (doc: string, readOnly: boolean) =>
    EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        indentOnInput(),
        indentUnit.of('  '),
        EditorState.tabSize.of(2),
        syntaxHighlighting(defaultHighlightStyle),
        bracketMatching(),
        closeBrackets(),
        foldGutter(),
        autocompletion(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': 'Code editor' }),
        javascript(),
        readOnlyConfig.of(readOnlyExtensions(readOnly)),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          indentWithTab
        ]),
        EditorView.updateListener.of(update => {
          if (!update.docChanged) return

          const value = update.state.doc.toString()
          emit('update:modelValue', value)
          emit('input', value)
          emit('change', value)
        })
      ]
    })

  onMounted(() => {
    if (!editorContainer.value) return

    editorView = new EditorView({
      parent: editorContainer.value,
      state: createEditorState(props.modelValue, props.readOnly)
    })
  })

  watch(
    () => props.modelValue,
    value => {
      if (!editorView || editorView.state.doc.toString() === value) return

      editorView.setState(createEditorState(value, props.readOnly))
    }
  )

  watch(
    () => props.readOnly,
    readOnly => {
      editorView?.dispatch({ effects: readOnlyConfig.reconfigure(readOnlyExtensions(readOnly)) })
    }
  )

  const format = async () => {
    const view = editorView
    if (!view || props.readOnly) return

    const source = view.state.doc.toString()
    const formatted = await formatCode(source)
    // Formatting loads asynchronously; never overwrite edits made while it was loading.
    if (editorView !== view || props.readOnly || view.state.doc.toString() !== source) {
      throw new Error('Content changed during formatting')
    }

    if (formatted !== source) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: formatted } })
    }
  }

  onBeforeUnmount(() => {
    editorView?.destroy()
    editorView = null
  })

  defineExpose({ format })
</script>

<template>
  <div ref="editorContainer" class="code-editor" :style="{ height }" />
</template>

<style lang="scss" scoped>
  .code-editor {
    width: 100%;
    border: 1px solid var(--el-border-color);
    border-radius: var(--el-border-radius-base);
    overflow: hidden;
  }

  .code-editor :deep(.cm-editor) {
    height: 100%;
    font-size: 14px;
    background: var(--el-bg-color);
    color: var(--el-text-color-primary);
  }

  .code-editor :deep(.cm-scroller) {
    overflow: auto;
    font-family: Menlo, Monaco, Consolas, monospace;
  }
</style>

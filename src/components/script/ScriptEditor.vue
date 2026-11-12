<script lang="ts" setup>
  import { ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import CodeEditor from '../common/CodeEditor.vue'
  import SaveStatus from '../common/SaveStatus.vue'
  import { logError } from '../../utils/logger'

  interface Props {
    modelValue: string
    isSaved: boolean
  }

  interface Emits {
    (e: 'update:modelValue', value: string): void
    (e: 'input', value: string): void
    (e: 'format'): void
    (e: 'execute'): void
  }

  defineProps<Props>()
  const emit = defineEmits<Emits>()
  const { t } = useI18n()

  const codeEditorRef = ref<InstanceType<typeof CodeEditor>>()

  const handleFormat = async () => {
    try {
      await codeEditorRef.value?.format()
      ElMessage.success(t('script.formatSuccess'))
    } catch (error) {
      logError(t('script.formatLogFailed'), error)
      ElMessage.error(t('script.formatFailed'))
    }
  }

  const handleExecute = () => {
    emit('execute')
  }
</script>

<template>
  <div class="script-editor">
    <div class="script-editor__header">
      <div class="script-editor__title-wrapper">
        <div class="script-editor__title-content">
          <h4>{{ t('script.editorTitle') }}</h4>
          <SaveStatus :is-saved="isSaved" />
        </div>
      </div>
      <div class="script-editor__actions">
        <el-button type="primary" size="small" @click="handleFormat">
          <el-icon><i-ep-setting /></el-icon>
          {{ t('script.format') }}
        </el-button>
        <el-button type="success" size="small" @click="handleExecute">
          <el-icon><i-ep-video-play /></el-icon>
          {{ t('script.execute') }}
        </el-button>
      </div>
    </div>

    <div class="script-editor__body">
      <div class="script-editor__container">
        <CodeEditor
          ref="codeEditorRef"
          :model-value="modelValue"
          height="400px"
          @update:model-value="val => emit('update:modelValue', val)"
          @input="val => emit('input', val)"
        />
      </div>

      <div class="script-editor__tip">
        <el-icon class="script-editor__tip-icon"><i-ep-info-filled /></el-icon>
        <div class="script-editor__tip-content">
          <p class="script-editor__tip-title">{{ t('script.instructions') }}</p>
          <p class="script-editor__tip-text">
            {{ t('script.instructionsText') }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .script-editor {
    background: var(--el-bg-color);
    border-radius: var(--el-border-radius-base);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    overflow: hidden;
    transition: all 0.3s;

    &:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
      transform: translateY(-2px);
    }
  }

  .script-editor__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px;
    background: linear-gradient(135deg, #f5f7fa 0%, #ffffff 100%);
    border-bottom: 1px solid var(--el-border-color);
  }

  .script-editor__title-wrapper {
    display: flex;
    align-items: center;
    flex: 1;
  }

  .script-editor__title-content {
    margin-right: 12px;
    display: flex;
    align-items: center;
    flex: 1;
    justify-content: space-between;

    h4 {
      margin: 0;
    }
  }

  .script-editor__actions {
    display: flex;
    gap: 12px;
  }

  .script-editor__actions :deep(.el-button + .el-button) {
    margin-left: 0;
  }

  .script-editor__body {
    padding: 8px;
  }

  .script-editor__container {
    margin-bottom: 12px;
  }

  .script-editor__tip {
    display: flex;
    gap: 12px;
    padding: 8px;
    background: linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%);
    border-radius: var(--el-border-radius-base);
    border-left: 4px solid var(--el-color-primary);
  }

  .script-editor__tip-icon {
    color: var(--el-color-primary);
  }

  .script-editor__tip-content {
    flex: 1;
  }

  .script-editor__tip-title {
    margin: 0 0 4px 0;
    font-weight: 600;
  }

  .script-editor__tip-text {
    margin: 0;
    font-size: 12px;
    color: var(--el-text-color-regular);
  }
</style>

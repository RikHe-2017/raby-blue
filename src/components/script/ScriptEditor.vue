<script lang="ts" setup>
  import { ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import MonacoEditor from '../common/MonacoEditor.vue'

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

  const monacoEditorRef = ref<InstanceType<typeof MonacoEditor>>()

  const handleFormat = () => {
    try {
      monacoEditorRef.value?.format()
      ElMessage.success('格式化成功')
    } catch (error) {
      console.error('格式化失败:', error)
      ElMessage.error('格式化失败，请检查代码语法')
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
        <el-icon class="script-editor__icon"><i-ep-document /></el-icon>
        <div class="script-editor__title-content">
          <h4>JS 代码编辑器</h4>
          <el-icon v-if="isSaved" class="script-editor__saved-icon">
            <i-ep-check />
          </el-icon>
        </div>
      </div>
      <div class="script-editor__actions">
        <el-button type="primary" size="small" @click="handleFormat">
          <el-icon><i-ep-setting /></el-icon>
          格式化
        </el-button>
        <el-button type="success" size="small" @click="handleExecute">
          <el-icon><i-ep-video-play /></el-icon>
          执行
        </el-button>
      </div>
    </div>

    <div class="script-editor__body">
      <div class="script-editor__container">
        <MonacoEditor
          ref="monacoEditorRef"
          :model-value="modelValue"
          language="javascript"
          height="400px"
          @update:model-value="val => emit('update:modelValue', val)"
          @input="val => emit('input', val)"
        />
      </div>

      <div class="script-editor__tip">
        <el-icon class="script-editor__tip-icon"><i-ep-info-filled /></el-icon>
        <div class="script-editor__tip-content">
          <p class="script-editor__tip-title">使用说明</p>
          <p class="script-editor__tip-text">
            脚本将在当前活动标签页中执行。点击"执行"按钮即可运行代码。支持语法高亮、代码补全和格式化功能。
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

  .script-editor__icon {
    color: var(--el-color-primary);
    margin-right: 12px;
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

  .script-editor__saved-icon {
    color: #67c23a;
    animation: fadeIn 0.3s;
  }

  .script-editor__actions {
    display: flex;
    gap: var(--el-component-size-small);
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

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.8);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>

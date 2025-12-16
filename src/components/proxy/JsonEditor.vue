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
      ElMessage.error('格式化失败，请检查JSON语法')
    }
  }
</script>

<template>
  <div class="json-editor">
    <div class="json-editor__header">
      <div class="json-editor__title-wrapper">
        <el-icon class="json-editor__icon"><i-ep-document /></el-icon>
        <div class="json-editor__title-content">
          <h4>JSON 配置文件</h4>
          <el-icon v-if="isSaved" class="json-editor__saved-icon">
            <i-ep-check />
          </el-icon>
        </div>
      </div>
      <div class="json-editor__actions">
        <el-button type="primary" size="small" @click="handleFormat">
          <el-icon><i-ep-setting /></el-icon>
          格式化
        </el-button>
      </div>
    </div>

    <div class="json-editor__body">
      <div class="json-editor__container">
        <MonacoEditor
          ref="monacoEditorRef"
          :model-value="modelValue"
          language="json"
          height="400px"
          @update:model-value="val => emit('update:modelValue', val)"
          @input="val => emit('input', val)"
        />
      </div>

      <div class="json-editor__tip">
        <el-icon class="json-editor__tip-icon"><i-ep-info-filled /></el-icon>
        <div class="json-editor__tip-content">
          <p class="json-editor__tip-title">配置说明</p>
          <p class="json-editor__tip-text">
            在 proxy 数组中配置代理规则，格式为 "源地址 -> 目标地址"。支持通配符匹配，如
            "*.example.com/*" 匹配所有 example.com 域名下的资源。
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .json-editor {
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

  .json-editor__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px;
    background: linear-gradient(135deg, #f5f7fa 0%, #ffffff 100%);
    border-bottom: 1px solid var(--el-border-color);
  }

  .json-editor__title-wrapper {
    display: flex;
    align-items: center;
    flex: 1;
  }

  .json-editor__icon {
    color: var(--el-color-primary);
    margin-right: 12px;
  }

  .json-editor__title-content {
    margin-right: 12px;
    display: flex;
    align-items: center;
    flex: 1;
    justify-content: space-between;

    h4 {
      margin: 0;
    }
  }

  .json-editor__saved-icon {
    color: #67c23a;
    animation: fadeIn 0.3s;
  }

  .json-editor__actions {
    display: flex;
    gap: var(--el-component-size-small);
  }

  .json-editor__body {
    padding: 8px;
  }

  .json-editor__container {
    margin-bottom: 12px;
  }

  .json-editor__tip {
    display: flex;
    gap: 12px;
    padding: 8px;
    background: linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%);
    border-radius: var(--el-border-radius-base);
    border-left: 4px solid var(--el-color-primary);
  }

  .json-editor__tip-icon {
    color: var(--el-color-primary);
  }

  .json-editor__tip-content {
    flex: 1;
  }

  .json-editor__tip-title {
    margin: 0 0 4px 0;
    font-weight: 600;
  }

  .json-editor__tip-text {
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

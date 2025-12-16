<script lang="ts" setup>
  import { ref, watch } from 'vue'

  interface Props {
    modelValue: string
    isActiveGroup: boolean
    isSaved: boolean
  }

  interface Emits {
    (e: 'update:modelValue', value: string): void
    (e: 'save', value: string): void
  }

  const props = defineProps<Props>()
  const emit = defineEmits<Emits>()

  const name = ref(props.modelValue)

  watch(
    () => props.modelValue,
    newValue => {
      name.value = newValue
    }
  )

  watch(name, newValue => {
    emit('update:modelValue', newValue)
  })
</script>

<template>
  <div class="name-editor">
    <div class="name-editor__header">
      <div class="name-editor__title-wrapper">
        <el-icon class="name-editor__icon"><i-ep-setting /></el-icon>
        <div class="name-editor__title-content">
          <h4>{{ isActiveGroup ? '分组名称' : '脚本名称' }}</h4>
          <el-icon v-if="isSaved" class="name-editor__saved-icon">
            <i-ep-check />
          </el-icon>
        </div>
      </div>
    </div>
    <div class="name-editor__body">
      <el-input
        :model-value="name"
        :placeholder="isActiveGroup ? '请输入分组名称' : '请输入脚本名称'"
        size="large"
        @update:model-value="
          (val: string) => {
            name = val
            emit('update:modelValue', val)
          }
        "
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .name-editor {
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

  .name-editor__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px;
    background: linear-gradient(135deg, #f5f7fa 0%, #ffffff 100%);
    border-bottom: 1px solid var(--el-border-color);
  }

  .name-editor__title-wrapper {
    display: flex;
    align-items: center;
    flex: 1;
    gap: var(--el-component-size-small);
  }

  .name-editor__icon {
    color: var(--el-color-primary);
    margin-top: 2px;
  }

  .name-editor__title-content {
    display: flex;
    justify-content: space-between;
    flex: 1;
    align-items: center;
    gap: var(--el-border-radius-small);

    h4 {
      margin: 0;
    }
  }

  .name-editor__saved-icon {
    color: #67c23a;
    animation: fadeIn 0.3s;
  }

  .name-editor__body {
    padding: 8px;
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

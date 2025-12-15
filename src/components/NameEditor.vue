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
  <div class="config-card name-edit-section">
    <div class="card-header">
      <div class="card-title-wrapper">
        <el-icon class="card-icon"><Setting /></el-icon>
        <div class="title-content">
          <h4>{{ isActiveGroup ? '分组名称' : '代理名称' }}</h4>
          <el-icon v-if="isSaved" class="saved-icon">
            <Check />
          </el-icon>
        </div>
      </div>
    </div>
    <div class="card-body">
      <el-input
        :model-value="name"
        :placeholder="isActiveGroup ? '请输入分组名称' : '请输入代理名称'"
        size="large"
        @update:model-value="
          val => {
            name = val
            emit('update:modelValue', val)
          }
        "
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .config-card {
    background: var(--el-bg-color);
    border-radius: var(--el-border-radius-base);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    overflow: hidden;
    transition: all 0.3s;

    &:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
      transform: translateY(-2px);
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--el-component-size-small) var(--el-component-size);
      background: linear-gradient(135deg, #f5f7fa 0%, #ffffff 100%);
      border-bottom: 1px solid var(--el-border-color);

      .card-title-wrapper {
        display: flex;
        align-items: flex-start;
        gap: var(--el-component-size-small);

        .card-icon {
          color: var(--el-color-primary);
          margin-top: 2px;
        }

        .title-content {
          display: flex;
          flex-direction: column;
          gap: var(--el-border-radius-small);

          h4 {
            margin: 0;
          }

          .saved-icon {
            color: #67c23a;
            animation: fadeIn 0.3s;
          }
        }
      }
    }

    .card-body {
      padding: var(--el-component-size);
    }
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

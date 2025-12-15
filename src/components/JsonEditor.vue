<script lang="ts" setup>
  import { ref, watch } from 'vue'

  interface Props {
    modelValue: string
    isSaved: boolean
  }

  interface Emits {
    (e: 'update:modelValue', value: string): void
    (e: 'input', value: string): void
    (e: 'format'): void
  }

  const props = defineProps<Props>()
  const emit = defineEmits<Emits>()

  const jsonValue = ref(props.modelValue)

  watch(
    () => props.modelValue,
    newValue => {
      jsonValue.value = newValue
    }
  )

  watch(jsonValue, newValue => {
    emit('update:modelValue', newValue)
    emit('input', newValue)
  })

  const handleFormat = () => {
    emit('format')
  }
</script>

<template>
  <div class="config-card json-editor-section">
    <div class="card-header">
      <div class="card-title-wrapper">
        <el-icon class="card-icon"><Document /></el-icon>
        <div class="title-content">
          <h4>JSON 配置文件</h4>
          <el-icon v-if="isSaved" class="saved-icon">
            <Check />
          </el-icon>
        </div>
      </div>
      <div class="card-actions">
        <el-button type="primary" size="small" @click="handleFormat">
          <el-icon><Setting /></el-icon>
          格式化
        </el-button>
      </div>
    </div>

    <div class="card-body">
      <div class="json-editor-container">
        <el-input
          :model-value="jsonValue"
          type="textarea"
          :rows="18"
          placeholder="请输入JSON配置..."
          class="json-editor"
          @update:model-value="
            val => {
              jsonValue = val
              emit('update:modelValue', val)
            }
          "
          @input="val => emit('input', val)"
        />
      </div>

      <div class="config-tip">
        <el-icon class="tip-icon"><InfoFilled /></el-icon>
        <div class="tip-content">
          <p class="tip-title">配置说明</p>
          <p class="tip-text">
            在 proxy 数组中配置代理规则，格式为 "源地址 -> 目标地址"。支持通配符匹配，如
            "*.example.com/*" 匹配所有 example.com 域名下的资源。
          </p>
        </div>
      </div>
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

      .card-actions {
        display: flex;
        gap: var(--el-component-size-small);
      }
    }

    .card-body {
      padding: var(--el-component-size);
    }
  }

  .json-editor-section {
    .json-editor-container {
      margin-bottom: var(--el-component-size);
    }

    .config-tip {
      display: flex;
      gap: var(--el-component-size-small);
      padding: var(--el-component-size);
      background: linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%);
      border-radius: var(--el-border-radius-base);
      border-left: 4px solid var(--el-color-primary);

      .tip-icon {
        color: var(--el-color-primary);
      }

      .tip-content {
        flex: 1;

        .tip-title {
          margin: 0 0 4px 0;
          font-weight: 600;
        }

        .tip-text {
          margin: 0;
          font-size: 12px;
          color: var(--el-text-color-regular);
        }
      }
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

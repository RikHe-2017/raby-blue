<script lang="ts" setup>
  import NameEditor from './NameEditor.vue'
  import JsonEditor from './JsonEditor.vue'
  import type { ProxyRule } from '../types/proxy'

  interface Props {
    activeGroupId: string
    isActiveGroup: boolean
    activeRule: ProxyRule | null
    activeItemName: string
    jsonConfig: string
    isNameSaved: boolean
    isConfigSaved: boolean
  }

  interface Emits {
    (e: 'update:activeItemName', value: string): void
    (e: 'update:jsonConfig', value: string): void
    (e: 'json-input', value: string): void
    (e: 'format-json'): void
  }

  const props = defineProps<Props>()
  const emit = defineEmits<Emits>()
</script>

<template>
  <div v-if="activeGroupId" class="config-section">
    <!-- 名称编辑区域 -->
    <NameEditor
      :model-value="activeItemName"
      :is-active-group="isActiveGroup"
      :is-saved="isNameSaved"
      @update:model-value="val => emit('update:activeItemName', val)"
    />

    <!-- 代理配置区域 -->
    <div v-if="!isActiveGroup && activeRule" class="proxy-config-section">
      <JsonEditor
        :model-value="jsonConfig"
        :is-saved="isConfigSaved"
        @update:model-value="val => emit('update:jsonConfig', val)"
        @input="val => emit('json-input', val)"
        @format="emit('format-json')"
      />
    </div>
  </div>
  <div v-else class="empty-state">
    <div class="empty-content">
      <el-icon class="empty-icon"><Document /></el-icon>
      <p class="empty-text">请选择一个分组或代理来配置</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .config-section {
    display: flex;
    flex-direction: column;
    gap: var(--el-component-size);
  }

  .empty-state {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;

    .empty-content {
      text-align: center;
      padding: calc(var(--el-component-size) * 2);

      .empty-icon {
        font-size: 64px;
        color: var(--el-text-color-disabled);
        margin-bottom: var(--el-component-size);
        opacity: 0.5;
      }

      .empty-text {
        color: var(--el-text-color-secondary);
      }
    }
  }
</style>

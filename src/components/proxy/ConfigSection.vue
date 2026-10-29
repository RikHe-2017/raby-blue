<script lang="ts" setup>
  import NameEditor from './NameEditor.vue'
  import type { ProxyRule } from '../../types/proxy'

  interface Props {
    activeGroupId: string
    isActiveGroup: boolean
    activeRule: ProxyRule | null
    activeItemName: string
    sourceUrl: string
    targetUrl: string
    isNameSaved: boolean
    isConfigSaved: boolean
  }

  interface Emits {
    (e: 'update:activeItemName', value: string): void
    (e: 'update:sourceUrl', value: string): void
    (e: 'update:targetUrl', value: string): void
  }

  defineProps<Props>()
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
    <div v-if="!isActiveGroup && activeRule" class="config-section__proxy">
      <div class="config-section__save-status" role="status" aria-live="polite">
        <el-icon v-if="isConfigSaved" class="config-section__saved-icon"><i-ep-check /></el-icon>
        <span>{{ isConfigSaved ? '已保存' : '待保存' }}</span>
      </div>
      <div class="config-section__fields">
        <div class="config-section__field">
          <label for="proxy-source-url">源地址（匹配规则）</label>
          <el-input
            id="proxy-source-url"
            :model-value="sourceUrl"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            resize="none"
            placeholder="https://example.com/app/"
            spellcheck="false"
            @update:model-value="val => emit('update:sourceUrl', val)"
          />
        </div>
        <div class="config-section__field">
          <label for="proxy-target-url">目标地址</label>
          <el-input
            id="proxy-target-url"
            :model-value="targetUrl"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            resize="none"
            placeholder="http://127.0.0.1:3000/app/"
            spellcheck="false"
            @update:model-value="val => emit('update:targetUrl', val)"
          />
        </div>
      </div>
    </div>
  </div>
  <div v-else class="config-section config-section--empty">
    <div class="config-section__empty-content">
      <el-icon class="config-section__empty-icon"><i-ep-document /></el-icon>
      <p class="config-section__empty-text">请选择一个分组或代理来配置</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .config-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .config-section--empty {
    justify-content: center;
    align-items: center;
    height: 100%;
  }

  .config-section__proxy {
    min-width: 0;
    padding: 12px 8px;
    background: var(--el-bg-color);
    border-radius: 4px;
  }

  .config-section__save-status {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    min-height: 20px;
    margin-bottom: 8px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  .config-section__saved-icon {
    color: var(--el-color-success);
  }

  .config-section__fields {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .config-section__field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: var(--el-text-color-regular);
    font-size: 14px;
  }

  .config-section__empty-content {
    text-align: center;
    padding: calc(var(--el-component-size) * 2);
  }

  .config-section__empty-icon {
    font-size: 64px;
    color: var(--el-text-color-disabled);
    margin-bottom: var(--el-component-size);
    opacity: 0.5;
  }

  .config-section__empty-text {
    color: var(--el-text-color-secondary);
  }
</style>

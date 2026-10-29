<script lang="ts" setup>
  import NameEditor from './NameEditor.vue'
  import SaveStatus from '../common/SaveStatus.vue'
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
      <div class="config-section__proxy-header">
        <h4 class="config-section__proxy-title">代理配置</h4>
        <SaveStatus :is-saved="isConfigSaved" />
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
    background: var(--el-bg-color);
    border-radius: 4px;
    overflow: hidden;
  }

  .config-section__proxy-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px;
    background: linear-gradient(135deg, #f5f7fa 0%, #ffffff 100%);
    border-bottom: 1px solid var(--el-border-color);
  }

  .config-section__proxy-title {
    margin: 0;
  }

  .config-section__fields {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px;
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

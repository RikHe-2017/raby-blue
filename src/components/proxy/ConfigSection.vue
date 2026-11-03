<script lang="ts" setup>
  import { computed } from 'vue'
  import NameEditor from './NameEditor.vue'
  import SaveStatus from '../common/SaveStatus.vue'
  import HeaderSettings from './HeaderSettings.vue'
  import type { HeaderSetting, ProxyRule } from '../../types/proxy'
  import { isRegexSource } from '../../document-response-rules'

  interface Props {
    activeGroupId: string
    isActiveGroup: boolean
    activeRule: ProxyRule | null
    activeItemName: string
    sourceUrl: string
    targetUrl: string
    isNameSaved: boolean
    isConfigSaved: boolean
    isSuccessNotificationSaving: boolean
    requestHeaders: HeaderSetting[]
    responseHeaders: HeaderSetting[]
    isRequestHeadersSaved: boolean
    isResponseHeadersSaved: boolean
    requestHeadersError: string
    responseHeadersError: string
  }

  interface Emits {
    (e: 'update:activeItemName', value: string): void
    (e: 'update:sourceUrl', value: string): void
    (e: 'update:targetUrl', value: string): void
    (e: 'update:showSuccessNotification', value: boolean): void
    (e: 'update:requestHeaders', value: HeaderSetting[]): void
    (e: 'update:responseHeaders', value: HeaderSetting[]): void
  }

  const props = defineProps<Props>()
  const emit = defineEmits<Emits>()
  const sourceIsRegex = computed(() => isRegexSource(props.sourceUrl.trim()))
</script>

<template>
  <div v-if="activeGroupId" class="config-section">
    <section
      v-if="!isActiveGroup && activeRule"
      class="config-section__proxy"
      aria-label="代理成功提示"
    >
      <div class="config-section__proxy-header">
        <h4 class="config-section__proxy-title">代理成功提示</h4>
        <SaveStatus :is-saved="!isSuccessNotificationSaving" />
      </div>
      <div class="config-section__notification-row">
        <span class="config-section__notification-label">在被代理的页面上展示代理成功提示</span>
        <el-switch
          :model-value="activeRule.showSuccessNotification === true"
          :loading="isSuccessNotificationSaving"
          aria-label="在被代理的页面上展示代理成功提示"
          @update:model-value="value => emit('update:showSuccessNotification', value === true)"
        />
      </div>
    </section>
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
          <div class="config-section__field-label">
            <label for="proxy-source-url">源地址（匹配规则）</label>
            <el-tag v-if="sourceIsRegex" size="small" effect="plain">正则</el-tag>
          </div>
          <el-input
            id="proxy-source-url"
            :model-value="sourceUrl"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            resize="none"
            :placeholder="'普通地址：https://example.com/app/\n正则表达式：^https://example\\.com/app/(.*)$'"
            spellcheck="false"
            @update:model-value="val => emit('update:sourceUrl', val)"
          />
        </div>
        <div class="config-section__field">
          <label for="proxy-target-url">目标地址（选填）</label>
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
    <template v-if="!isActiveGroup && activeRule">
      <HeaderSettings
        title="请求头设置"
        direction="request"
        :model-value="requestHeaders"
        :is-saved="isRequestHeadersSaved"
        :error="requestHeadersError"
        @update:model-value="value => emit('update:requestHeaders', value)"
      />
      <HeaderSettings
        title="响应头设置"
        direction="response"
        :model-value="responseHeaders"
        :is-saved="isResponseHeadersSaved"
        :error="responseHeadersError"
        @update:model-value="value => emit('update:responseHeaders', value)"
      />
    </template>
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

  .config-section__notification-row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px;
  }

  .config-section__notification-label {
    flex: 1;
    min-width: 0;
    color: var(--el-text-color-regular);
    font-size: var(--el-font-size-base);
  }

  .config-section__notification-row :deep(.el-switch) {
    flex-shrink: 0;
  }

  .config-section__field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: var(--el-text-color-regular);
    font-size: 14px;
  }

  .config-section__field-label {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
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

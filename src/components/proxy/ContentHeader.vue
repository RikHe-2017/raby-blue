<script lang="ts" setup>
  import type { ProxyRuntimeStatus } from '../../proxy/runtime-status'

  interface Props {
    proxyEnabled: boolean
    pending?: boolean
    runtimeStatus?: ProxyRuntimeStatus
  }

  interface Emits {
    (e: 'toggle-proxy'): void
  }

  defineProps<Props>()
  const emit = defineEmits<Emits>()

  const handleToggle = () => {
    emit('toggle-proxy')
  }
</script>

<template>
  <div class="content-header">
    <div class="content-header__content">
      <div class="content-header__title">
        <div class="content-header__title-wrapper">
          <div class="content-header__title-content">
            <span class="content-header__title-text">RabyBlue（欢迎使用蓝兔）</span>
            <span class="content-header__subtitle">一个浏览器请求代理插件</span>
          </div>
        </div>
      </div>
      <div class="content-header__actions">
        <div class="content-header__switch">
          <el-switch
            :model-value="
              proxyEnabled &&
              !pending &&
              runtimeStatus?.phase !== 'applying' &&
              runtimeStatus?.phase !== 'error'
            "
            :loading="pending || runtimeStatus?.phase === 'applying'"
            :disabled="pending || runtimeStatus?.phase === 'applying'"
            aria-label="代理总控"
            @change="handleToggle"
          />
        </div>
      </div>
    </div>
    <p v-if="runtimeStatus?.phase === 'applying'" class="content-header__status" role="status">
      代理配置初始化中…
    </p>
    <p
      v-else-if="runtimeStatus?.phase === 'error'"
      class="content-header__status content-header__status--error"
      role="alert"
    >
      {{ runtimeStatus.message }}
    </p>
    <p
      v-else-if="runtimeStatus?.phase === 'active' && proxyEnabled"
      class="content-header__status"
      role="status"
    >
      代理已就绪
    </p>
  </div>
</template>

<style lang="scss" scoped>
  .content-header {
    border-bottom: 1px solid var(--el-border-color);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .content-header__status {
    margin: 0;
    padding: 0 8px 8px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    overflow-wrap: anywhere;
  }

  .content-header__status--error {
    color: var(--el-color-danger);
  }

  .content-header__content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--el-component-size);
    padding: 4px 8px;
  }

  .content-header__title {
    flex: 1;
  }

  .content-header__title-wrapper {
    display: flex;
    align-items: center;
  }

  .content-header__title-content {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .content-header__title-text {
    font-size: 18px;
    font-weight: 600;
  }

  .content-header__subtitle {
    font-size: 12px;
  }

  .content-header__switch {
    display: flex;
    align-items: center;
    gap: var(--el-component-size-small);
    background: rgba(255, 255, 255, 0.15);
    padding: var(--el-border-radius-small) var(--el-component-size-small);
    border-radius: var(--el-border-radius-base);
    backdrop-filter: blur(10px);
  }
</style>

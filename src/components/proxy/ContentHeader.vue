<script lang="ts" setup>
  interface Props {
    proxyEnabled: boolean
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
            <span class="content-header__title-text">RabyBlue</span>
            <span class="content-header__subtitle">一个浏览器请求代理插件</span>
          </div>
        </div>
      </div>
      <div class="content-header__actions">
        <div class="content-header__switch">
          <el-switch :model-value="proxyEnabled" @change="handleToggle" />
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .content-header {
    border-bottom: 1px solid var(--el-border-color);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
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

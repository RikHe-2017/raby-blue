<script lang="ts" setup>
  interface Props {
    proxyEnabled: boolean
  }

  interface Emits {
    (e: 'toggle-proxy'): void
  }

  const props = defineProps<Props>()
  const emit = defineEmits<Emits>()

  const handleToggle = () => {
    emit('toggle-proxy')
  }
</script>

<template>
  <div class="content-header">
    <div class="header-content">
      <div class="header-title-section">
        <div class="title-wrapper">
          <el-icon class="title-icon"><Setting /></el-icon>
          <div class="title-content">
            <span class="title">RabyBlue</span>
            <span class="subtitle">一个浏览器请求代理插件</span>
          </div>
        </div>
      </div>
      <div class="header-actions-section">
        <div class="proxy-switch-wrapper">
          <el-switch
            :model-value="proxyEnabled"
            active-text="启用"
            inactive-text="禁用"
            @change="handleToggle"
            size="large"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .content-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-bottom: 1px solid var(--el-border-color);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

    .header-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--el-component-size);
      padding: var(--el-component-size) var(--el-component-size-small);

      .header-title-section {
        flex: 1;

        .title-wrapper {
          display: flex;
          align-items: center;
          gap: var(--el-component-size-small);

          .title-icon {
            color: white;
          }

          .title {
            color: white;
            font-size: 18px;
            font-weight: 600;
          }

          .subtitle {
            color: rgba(255, 255, 255, 0.8);
            font-size: 12px;
          }

          .title-content {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
          }
        }
      }

      .header-actions-section {
        .proxy-switch-wrapper {
          display: flex;
          align-items: center;
          gap: var(--el-component-size-small);
          background: rgba(255, 255, 255, 0.15);
          padding: var(--el-border-radius-small) var(--el-component-size-small);
          border-radius: var(--el-border-radius-base);
          backdrop-filter: blur(10px);
        }
      }
    }
  }
</style>

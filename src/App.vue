<script lang="ts" setup>
  import { ref } from 'vue'
  import { ElConfigProvider } from 'element-plus'
  import ProxyView from './components/proxy/ProxyView.vue'
  import ScriptView from './components/script/ScriptView.vue'

  const activeTab = ref<'proxy' | 'script'>('proxy')

  const handleTabChange = (tab: 'proxy' | 'script') => {
    activeTab.value = tab
  }
</script>

<template>
  <el-config-provider :size="'small'">
    <div class="app">
      <!-- 标签页切换 -->
      <div class="app__tabs">
        <el-tabs v-model="activeTab" @tab-change="handleTabChange">
          <el-tab-pane label="代理配置" name="proxy">
            <template #label>
              <span class="app__tab-label">
                <el-icon><i-ep-setting /></el-icon>
                <span>代理配置</span>
              </span>
            </template>
          </el-tab-pane>
          <el-tab-pane label="JS脚本" name="script">
            <template #label>
              <span class="app__tab-label">
                <el-icon><i-ep-document /></el-icon>
                <span>JS脚本</span>
              </span>
            </template>
          </el-tab-pane>
        </el-tabs>
      </div>

      <!-- 内容区域 -->
      <div class="app__content">
        <ProxyView v-if="activeTab === 'proxy'" />
        <ScriptView v-if="activeTab === 'script'" />
      </div>
    </div>
  </el-config-provider>
</template>

<style lang="scss" scoped>
  .app {
    display: flex;
    flex-direction: column;
    width: 800px;
    height: 600px;
    background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
    border-radius: var(--el-border-radius-base);
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  }

  .app__tabs {
    background: var(--el-bg-color);
    border-bottom: 1px solid var(--el-border-color);
    padding: 0 8px;

    :deep(.el-tabs__header) {
      margin: 0;
    }

    :deep(.el-tabs__nav-wrap) {
      &::after {
        display: none;
      }
    }
  }

  .app__tab-label {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .app__content {
    flex: 1;
    overflow: hidden;
  }
</style>

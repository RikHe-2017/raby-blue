<script lang="ts" setup>
  import { computed, defineAsyncComponent, nextTick, ref, onMounted } from 'vue'
  import { ElConfigProvider, ElMessage } from 'element-plus'
  import ProxyView from './components/proxy/ProxyView.vue'
  import ScriptView from './components/script/ScriptView.vue'
  import { useUserPreferencesStore } from './stores/user-preferences'
  import { useProxyStore } from './stores/proxy'
  import { useScriptStore } from './stores/script'
  import { useI18n } from 'vue-i18n'
  import type { SupportedLocale } from './locales'

  const ConfigTransferDialog = defineAsyncComponent(
    () => import('./components/config-transfer/ConfigTransferDialog.vue')
  )

  const userPreferences = useUserPreferencesStore()
  const { t, locale } = useI18n()
  const activeTab = computed(() => userPreferences.preferences.activeTab)
  const proxyView = ref<InstanceType<typeof ProxyView>>()
  const scriptView = ref<InstanceType<typeof ScriptView>>()
  const transferVisible = ref(false)
  const openingTransfer = ref(false)
  const viewsPaused = ref(false)
  const showProxyView = computed(() => !viewsPaused.value && activeTab.value === 'proxy')
  const showScriptView = computed(() => !viewsPaused.value && activeTab.value === 'script')
  const selectedLocale = computed<SupportedLocale>({
    get: () => locale.value as SupportedLocale,
    set: value => {
      locale.value = value
      void userPreferences.update({ locale: value })
    }
  })

  const openTransfer = async () => {
    if (openingTransfer.value) return
    openingTransfer.value = true
    try {
      await proxyView.value?.flushPendingChanges()
      await scriptView.value?.flushPendingChanges()
      await Promise.all([useProxyStore().loadConfig(), useScriptStore().loadConfig()])
      await nextTick()
      transferVisible.value = true
    } catch (error) {
      ElMessage.error(
        t('errors.loadConfigFailed', {
          message: error instanceof Error ? error.message : t('errors.unknown')
        })
      )
    } finally {
      openingTransfer.value = false
    }
  }

  onMounted(() => userPreferences.load())

  const handleTabChange = (tab: string | number) => {
    if (tab === 'proxy' || tab === 'script') {
      userPreferences.update({ activeTab: tab })
    }
  }
</script>

<template>
  <el-config-provider :size="'small'">
    <div v-if="userPreferences.ready" class="app">
      <!-- 标签页切换 -->
      <div class="app__tabs">
        <el-tabs
          :model-value="activeTab"
          class="app__navigation"
          @tab-change="handleTabChange"
          lazy
        >
          <el-tab-pane :label="t('tabs.proxy')" name="proxy">
            <template #label>
              <span class="app__tab-label">
                <el-icon><i-ep-setting /></el-icon>
                <span>{{ t('tabs.proxy') }}</span>
              </span>
            </template>
          </el-tab-pane>
          <el-tab-pane :label="t('tabs.script')" name="script">
            <template #label>
              <span class="app__tab-label">
                <el-icon><i-ep-document /></el-icon>
                <span>{{ t('tabs.script') }}</span>
              </span>
            </template>
          </el-tab-pane>
        </el-tabs>
        <el-select
          v-model="selectedLocale"
          class="app__language"
          :aria-label="t('actions.language')"
          size="small"
        >
          <el-option value="zh-CN" :label="t('actions.chinese')" />
          <el-option value="en-US" :label="t('actions.english')" />
        </el-select>
        <el-tooltip :content="t('actions.settings')">
          <el-button
            class="app__settings"
            text
            circle
            :aria-label="t('actions.settings')"
            :loading="openingTransfer"
            @click="openTransfer"
          >
            <el-icon><i-ep-setting /></el-icon>
          </el-button>
        </el-tooltip>
      </div>

      <!-- 内容区域 -->
      <div class="app__content" :inert="openingTransfer">
        <ProxyView v-if="showProxyView" ref="proxyView" />
        <ScriptView v-if="showScriptView" ref="scriptView" />
      </div>
      <ConfigTransferDialog
        v-if="transferVisible"
        v-model="transferVisible"
        @import-start="viewsPaused = true"
        @import-end="viewsPaused = false"
      />
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
    display: flex;
    align-items: center;
    gap: 8px;
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

  .app__navigation {
    flex: 1;
    min-width: 0;
  }

  .app__settings {
    flex-shrink: 0;
  }

  .app__language {
    flex: 0 0 80px;
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

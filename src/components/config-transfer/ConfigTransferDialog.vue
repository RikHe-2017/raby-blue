<script lang="ts" setup>
  import { computed, nextTick, ref, toRaw } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import 'element-plus/es/components/message-box/style/css'
  import { useProxyStore } from '../../stores/proxy'
  import { useScriptStore } from '../../stores/script'
  import { createStorageAdapter } from '../../stores/storage'
  import { useUserPreferencesStore } from '../../stores/user-preferences'
  import { createDefaultTreeState } from '../../stores/user-preferences-model'
  import type { UserPreferencesPatch } from '../../stores/user-preferences-model'
  import type { ProxyNode } from '../../types/proxy'
  import type { ScriptNode } from '../../types/script'
  import { applyBackup, createBackup, parseBackup } from './transfer'
  import type { Backup, ExportScope, ImportMode } from './transfer'
  import LoggingSettings from '../logging/LoggingSettings.vue'

  defineProps<{ modelValue: boolean }>()
  const emit = defineEmits<{
    (event: 'update:modelValue', value: boolean): void
    (event: 'import-start'): void
    (event: 'import-end'): void
  }>()

  const proxyStore = useProxyStore()
  const { t } = useI18n()
  const scriptStore = useScriptStore()
  const userPreferences = useUserPreferencesStore()
  const storage = createStorageAdapter()
  const exportScope = ref<ExportScope>('all')
  const importMode = ref<ImportMode>('merge')
  const fileInput = ref<HTMLInputElement>()
  const fileName = ref('')
  const backup = ref<Backup | null>(null)
  const errorMessage = ref('')
  const busy = ref(false)
  const activeSettings = ref('transfer')
  const loggingBusy = ref(false)
  const reading = ref(false)
  const controlsDisabled = computed(() => busy.value || reading.value)
  const importDisabled = computed(() => controlsDisabled.value || !backup.value)
  const countItems = (nodes: (ProxyNode | ScriptNode)[]): number =>
    nodes.reduce(
      (count, node) => count + (node.type === 'group' ? countItems(node.children) : 1),
      0
    )
  const fileSummary = computed(() => {
    const parts: string[] = []
    if (backup.value?.proxyConfig)
      parts.push(t('transfer.proxySummary', { count: countItems(backup.value.proxyConfig.groups) }))
    if (backup.value?.scriptConfig)
      parts.push(
        t('transfer.scriptSummary', { count: countItems(backup.value.scriptConfig.groups) })
      )
    return parts.join(' · ')
  })

  const exportConfig = () => {
    try {
      const now = new Date().toISOString()
      const snapshot = createBackup(
        exportScope.value,
        toRaw(proxyStore.config),
        toRaw(scriptStore.config),
        now
      )
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
      )
      const link = document.createElement('a')
      link.href = url
      link.download = `raby-blue-${exportScope.value}-${now.slice(0, 10)}.json`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      ElMessage.success(t('transfer.exportSuccess'))
    } catch (error) {
      ElMessage.error(
        t('transfer.exportFailed', {
          message: error instanceof Error ? error.message : t('errors.unknown')
        })
      )
    }
  }

  const selectFile = async (event: Event) => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    backup.value = null
    errorMessage.value = ''
    fileName.value = file.name
    reading.value = true
    try {
      backup.value = parseBackup(await file.text(), file.name)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : t('transfer.fileReadFailed')
    } finally {
      reading.value = false
      input.value = ''
    }
  }

  const chooseFile = () => {
    if (!controlsDisabled.value) fileInput.value?.click()
  }

  const importConfig = async () => {
    if (!backup.value || controlsDisabled.value) return
    busy.value = true
    let started = false
    try {
      if (importMode.value === 'replace') {
        await ElMessageBox.confirm(
          t('transfer.confirmReplaceMessage', { summary: fileSummary.value }),
          t('transfer.confirmReplaceTitle'),
          {
            confirmButtonText: t('transfer.replace'),
            cancelButtonText: t('common.cancel'),
            type: 'warning'
          }
        )
      }

      emit('import-start')
      started = true
      await nextTick()
      const configs = applyBackup(
        {
          proxyConfig: toRaw(proxyStore.config),
          scriptConfig: toRaw(scriptStore.config)
        },
        toRaw(backup.value),
        importMode.value
      )
      const values: Record<string, unknown> = { ...configs }
      if (importMode.value === 'replace') {
        const patch: UserPreferencesPatch = {}
        if (configs.proxyConfig) patch.proxyUIState = createDefaultTreeState()
        if (configs.scriptConfig) patch.scriptUIState = createDefaultTreeState()
        await userPreferences.save(patch, values)
      } else await storage.setMany(values)
      if (configs.proxyConfig) proxyStore.config = configs.proxyConfig
      if (configs.scriptConfig) scriptStore.config = configs.scriptConfig
      emit('update:modelValue', false)
      ElMessage.success(t('transfer.importSuccess'))
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') {
        errorMessage.value = error instanceof Error ? error.message : t('transfer.importFailed')
      }
    } finally {
      busy.value = false
      if (started) emit('import-end')
    }
  }

  const updateVisible = (value: boolean) => {
    if (!busy.value && !loggingBusy.value) emit('update:modelValue', value)
  }
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('actions.settings')"
    width="640px"
    :style="{ maxWidth: 'calc(100vw - 24px)' }"
    :close-on-click-modal="false"
    :close-on-press-escape="!busy && !loggingBusy"
    :show-close="!busy && !loggingBusy"
    @update:model-value="updateVisible"
  >
    <el-tabs v-model="activeSettings">
      <el-tab-pane :label="t('transfer.tabs')" name="transfer" :disabled="loggingBusy" />
      <el-tab-pane :label="t('transfer.loggingTab')" name="logging" :disabled="controlsDisabled" />
    </el-tabs>
    <LoggingSettings v-if="activeSettings === 'logging'" @busy-change="loggingBusy = $event" />
    <div v-show="activeSettings === 'transfer'" class="config-transfer">
      <section class="config-transfer__section" :aria-label="t('transfer.importConfig')">
        <!-- Prettier uses self-closing input tags in Vue templates. -->
        <!-- eslint-disable vue/html-self-closing -->
        <input
          ref="fileInput"
          class="config-transfer__file-input"
          type="file"
          accept=".json,application/json"
          :aria-label="t('transfer.importFile')"
          @change="selectFile"
        />
        <!-- eslint-enable vue/html-self-closing -->
        <div class="config-transfer__row">
          <span class="config-transfer__label">{{ t('transfer.import') }}</span>
          <el-input
            class="config-transfer__file"
            :model-value="fileName"
            :disabled="controlsDisabled"
            readonly
            :placeholder="t('transfer.chooseFile')"
            :aria-label="t('transfer.file')"
            @click="chooseFile"
            @keydown.enter.prevent="chooseFile"
          >
            <template #append>
              <el-button
                :disabled="controlsDisabled"
                :aria-label="t('transfer.chooseFile')"
                @click.stop="chooseFile"
              >
                <el-icon><i-ep-folder-opened /></el-icon>
              </el-button>
            </template>
          </el-input>
          <el-button
            type="primary"
            :disabled="importDisabled"
            :loading="busy"
            @click="importConfig"
          >
            <el-icon><i-ep-upload /></el-icon>{{ t('transfer.importFileButton') }}
          </el-button>
        </div>
        <el-radio-group
          v-model="importMode"
          class="config-transfer__options"
          :disabled="controlsDisabled"
          :aria-label="t('transfer.importMode')"
        >
          <el-radio value="merge">{{ t('transfer.merge') }}</el-radio>
          <el-radio value="replace">{{ t('transfer.replace') }}</el-radio>
        </el-radio-group>
        <p v-if="errorMessage" class="config-transfer__error" role="alert">{{ errorMessage }}</p>
      </section>
      <section class="config-transfer__section" :aria-label="t('transfer.exportConfig')">
        <div class="config-transfer__row">
          <span class="config-transfer__label">{{ t('transfer.export') }}</span>
          <el-radio-group
            v-model="exportScope"
            class="config-transfer__export-options"
            :disabled="controlsDisabled"
            :aria-label="t('transfer.exportScope')"
          >
            <el-radio value="all">{{ t('transfer.exportAll') }}</el-radio>
            <el-radio value="proxy">{{ t('transfer.exportProxy') }}</el-radio>
            <el-radio value="script">{{ t('transfer.exportScript') }}</el-radio>
          </el-radio-group>
          <el-button type="primary" :disabled="controlsDisabled" @click="exportConfig">
            <el-icon><i-ep-download /></el-icon>{{ t('transfer.exportFile') }}
          </el-button>
        </div>
      </section>
    </div>
  </el-dialog>
</template>

<style lang="scss" scoped>
  .config-transfer {
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-height: 370px;
    overflow-y: auto;
  }

  .config-transfer__section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .config-transfer__section + .config-transfer__section {
    border-top: 1px solid var(--el-border-color-lighter);
    padding-top: 20px;
  }

  .config-transfer__file-input {
    display: none;
  }

  .config-transfer__row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .config-transfer__label {
    flex-shrink: 0;
    width: 32px;
    font-size: 14px;
    white-space: nowrap;
  }

  .config-transfer__file {
    flex: 1;
    min-width: 0;
  }

  .config-transfer__options {
    margin-left: 44px;
  }

  .config-transfer__options,
  .config-transfer__export-options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
  }

  .config-transfer__export-options {
    flex: 1;
    min-width: 0;
  }

  .config-transfer :deep(.el-radio) {
    margin-right: 0;
  }

  .config-transfer__error {
    margin: 0 0 0 44px;
    color: var(--el-color-danger);
    overflow-wrap: anywhere;
  }
</style>

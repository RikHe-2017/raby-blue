<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { useUserPreferencesStore } from '../../stores/user-preferences'
  import { LOG_LEVELS, localDateFilter } from '../../logging/model'
  import type { LogEntry, LogLevel, LoggingPreferences } from '../../logging/model'
  import { requestLogs } from '../../logging/client'
  import LogViewerDialog from './LogViewerDialog.vue'

  const emit = defineEmits<{ (event: 'busy-change', value: boolean): void }>()
  const { t } = useI18n()
  const preferences = useUserPreferencesStore()
  const settings = computed(() => preferences.preferences.logging)
  const busy = ref(false)
  const dates = ref<[string, string]>()
  const levels = ref<LogLevel[]>([...LOG_LEVELS])
  const error = ref('')
  const viewerVisible = ref(false)
  const retentionOptions = computed(() => [
    { value: 1, label: t('logging.retentionDays', { count: 1 }) },
    { value: 7, label: t('logging.retentionDays', { count: 7 }) },
    { value: 30, label: t('logging.retentionMonths', { count: 1, days: 30 }) },
    { value: 90, label: t('logging.retentionMonths', { count: 3, days: 90 }) },
    { value: 365, label: t('logging.retentionYear') }
  ])

  const run = async (operation: () => Promise<void>) => {
    if (busy.value) return
    busy.value = true
    emit('busy-change', true)
    error.value = ''
    try {
      await operation()
    } catch (reason) {
      if (reason !== 'cancel' && reason !== 'close') {
        error.value = reason instanceof Error ? reason.message : t('logging.operationFailed')
        ElMessage.error(error.value)
      }
    } finally {
      busy.value = false
      emit('busy-change', false)
    }
  }

  const save = (patch: Partial<LoggingPreferences>) =>
    run(async () => {
      await preferences.save({ logging: patch })
      try {
        await requestLogs('cleanup')
      } catch {
        throw new Error(t('logging.savedCleanupFailed'))
      }
      ElMessage.success(t('logging.settingsSaved'))
    })

  const exportLogs = () =>
    run(async () => {
      const filter = { ...localDateFilter(dates.value), levels: [...levels.value] }
      const entries = await requestLogs<LogEntry[]>('export', filter)
      if (!entries.length) {
        ElMessage.info(t('logging.noResults'))
        return
      }
      const now = new Date().toISOString()
      const url = URL.createObjectURL(
        new Blob([JSON.stringify({ exportedAt: now, filter, logs: entries }, null, 2)], {
          type: 'application/json'
        })
      )
      try {
        const link = document.createElement('a')
        link.href = url
        link.download = `raby-blue-logs-${now.replace(/[:.]/g, '-')}.json`
        link.click()
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      ElMessage.success(t('logging.exported', { count: entries.length }))
    })

  const saveRetention = (value: number) => save({ retentionDays: value })

  const saveLevels = (values: unknown[]) =>
    save({ levels: LOG_LEVELS.filter(level => values.includes(level)) })

  const clearLogs = () =>
    run(async () => {
      await ElMessageBox.confirm(t('logging.clearConfirm'), t('logging.clearTitle'), {
        type: 'warning',
        confirmButtonText: t('logging.clear'),
        cancelButtonText: t('common.cancel')
      })
      await requestLogs('clear')
      ElMessage.success(t('logging.cleared'))
    })

  onMounted(() =>
    run(async () => {
      await requestLogs('cleanup')
    })
  )
</script>

<template>
  <div class="logging-settings" v-loading="busy">
    <section
      class="logging-settings__section logging-settings__clear"
      :aria-label="t('logging.viewSection')"
    >
      <h3 class="logging-settings__heading">{{ t('logging.viewSection') }}</h3>
      <el-button :disabled="busy" @click="viewerVisible = true"
        ><el-icon><i-ep-view /></el-icon>{{ t('logging.view') }}</el-button
      >
    </section>
    <section class="logging-settings__section" :aria-label="t('logging.saveSettings')">
      <h3 class="logging-settings__heading">{{ t('logging.saveSettings') }}</h3>
      <div class="logging-settings__row">
        <span class="logging-settings__label">{{ t('logging.saveLevel') }}</span>
        <el-checkbox-group
          :model-value="settings.levels"
          :disabled="busy"
          :aria-label="t('logging.saveLevel')"
          @update:model-value="saveLevels"
        >
          <el-checkbox v-for="level in LOG_LEVELS" :key="level" :value="level">{{
            level
          }}</el-checkbox>
        </el-checkbox-group>
      </div>
      <div class="logging-settings__row">
        <label class="logging-settings__label" for="log-retention">{{
          t('logging.retention')
        }}</label>
        <el-select
          id="log-retention"
          class="logging-settings__retention"
          :model-value="settings.retentionDays"
          :disabled="busy"
          @update:model-value="saveRetention"
        >
          <el-option
            v-for="option in retentionOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </div>
    </section>
    <section class="logging-settings__section" :aria-label="t('logging.exportSection')">
      <h3 class="logging-settings__heading">{{ t('logging.exportSection') }}</h3>
      <div class="logging-settings__row">
        <span class="logging-settings__label">{{ t('logging.dateRange') }}</span>
        <el-date-picker
          v-model="dates"
          class="logging-settings__dates"
          type="daterange"
          value-format="YYYY-MM-DD"
          :start-placeholder="t('logging.allDates')"
          :end-placeholder="t('logging.allDates')"
          :disabled="busy"
          :teleported="false"
        />
      </div>
      <div class="logging-settings__row">
        <span class="logging-settings__label">{{ t('logging.exportLevel') }}</span>
        <el-checkbox-group v-model="levels" :disabled="busy" :aria-label="t('logging.exportLevel')">
          <el-checkbox v-for="level in LOG_LEVELS" :key="level" :value="level">{{
            level
          }}</el-checkbox>
        </el-checkbox-group>
      </div>
      <div class="logging-settings__commands">
        <el-button type="primary" :disabled="busy || !levels.length" @click="exportLogs"
          ><el-icon><i-ep-download /></el-icon>{{ t('logging.export') }}</el-button
        >
      </div>
    </section>
    <section
      class="logging-settings__section logging-settings__clear"
      :aria-label="t('logging.cleanup')"
    >
      <h3 class="logging-settings__heading">{{ t('logging.cleanup') }}</h3>
      <el-button type="danger" plain :disabled="busy" @click="clearLogs"
        ><el-icon><i-ep-delete /></el-icon>{{ t('logging.clearAll') }}</el-button
      >
    </section>
    <p v-if="error" class="logging-settings__error" role="alert">{{ error }}</p>
  </div>
  <LogViewerDialog v-if="viewerVisible" v-model="viewerVisible" />
</template>

<style scoped lang="scss">
  .logging-settings {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .logging-settings__section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .logging-settings__section + .logging-settings__section {
    border-top: 1px solid var(--el-border-color);
    padding-top: 16px;
  }
  .logging-settings__heading {
    margin: 0;
    font-size: 14px;
    color: var(--el-text-color-primary);
  }
  .logging-settings__row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex-wrap: wrap;
  }
  .logging-settings__label {
    flex: none;
    width: 64px;
  }
  .logging-settings__retention {
    width: 210px;
  }
  .logging-settings__dates {
    flex: 1;
    min-width: 240px;
    max-width: 100%;
  }
  .logging-settings__commands {
    display: flex;
    justify-content: flex-end;
  }
  .logging-settings__clear {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .logging-settings__error {
    color: var(--el-color-danger);
    margin: 0;
    overflow-wrap: anywhere;
  }
</style>

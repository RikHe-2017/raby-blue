<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { useUserPreferencesStore } from '../../stores/user-preferences'
  import { LOG_LEVELS, localDateFilter } from '../../logging/model'
  import type { LogEntry, LogLevel, LoggingPreferences } from '../../logging/model'
  import { requestLogs } from '../../logging/client'

  const emit = defineEmits<{ (event: 'busy-change', value: boolean): void }>()
  const preferences = useUserPreferencesStore()
  const settings = computed(() => preferences.preferences.logging)
  const busy = ref(false)
  const dates = ref<[string, string]>()
  const levels = ref<LogLevel[]>([...LOG_LEVELS])
  const error = ref('')
  const retentionOptions = [
    { value: 1, label: '1 天' },
    { value: 7, label: '7 天' },
    { value: 30, label: '1 个月（30 天）' },
    { value: 90, label: '3 个月（90 天）' },
    { value: 365, label: '1 年（365 天）' }
  ]

  const run = async (operation: () => Promise<void>) => {
    if (busy.value) return
    busy.value = true
    emit('busy-change', true)
    error.value = ''
    try {
      await operation()
    } catch (reason) {
      if (reason !== 'cancel' && reason !== 'close') {
        error.value = reason instanceof Error ? reason.message : '日志操作失败'
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
        throw new Error('日志设置已保存，但过期日志清理失败，请重试')
      }
      ElMessage.success('日志设置已保存')
    })

  const exportLogs = () =>
    run(async () => {
      const filter = { ...localDateFilter(dates.value), levels: [...levels.value] }
      const entries = await requestLogs<LogEntry[]>('export', filter)
      if (!entries.length) {
        ElMessage.info('没有符合条件的日志')
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
      ElMessage.success(`已导出 ${entries.length} 条日志`)
    })

  const saveRetention = (value: number) => save({ retentionDays: value })

  const saveLevels = (values: unknown[]) =>
    save({ levels: LOG_LEVELS.filter(level => values.includes(level)) })

  const clearLogs = () =>
    run(async () => {
      await ElMessageBox.confirm(
        '将永久删除全部已保存日志，日志设置不受影响。是否继续？',
        '清空日志',
        { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' }
      )
      await requestLogs('clear')
      ElMessage.success('日志已清空')
    })

  onMounted(() =>
    run(async () => {
      await requestLogs('cleanup')
    })
  )
</script>

<template>
  <div class="logging-settings" v-loading="busy">
    <section class="logging-settings__section" aria-label="日志保存设置">
      <h3 class="logging-settings__heading">保存设置</h3>
      <div class="logging-settings__row">
        <span class="logging-settings__label">保存等级</span>
        <el-checkbox-group
          :model-value="settings.levels"
          :disabled="busy"
          aria-label="保存等级"
          @update:model-value="saveLevels"
        >
          <el-checkbox v-for="level in LOG_LEVELS" :key="level" :value="level">{{
            level
          }}</el-checkbox>
        </el-checkbox-group>
      </div>
      <div class="logging-settings__row">
        <label class="logging-settings__label" for="log-retention">保存期限</label>
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
    <section class="logging-settings__section" aria-label="日志导出">
      <h3 class="logging-settings__heading">导出日志</h3>
      <div class="logging-settings__row">
        <span class="logging-settings__label">日期范围</span>
        <el-date-picker
          v-model="dates"
          class="logging-settings__dates"
          type="daterange"
          value-format="YYYY-MM-DD"
          start-placeholder="全部日期"
          end-placeholder="全部日期"
          :disabled="busy"
          :teleported="false"
        />
      </div>
      <div class="logging-settings__row">
        <span class="logging-settings__label">导出等级</span>
        <el-checkbox-group v-model="levels" :disabled="busy" aria-label="导出等级">
          <el-checkbox v-for="level in LOG_LEVELS" :key="level" :value="level">{{
            level
          }}</el-checkbox>
        </el-checkbox-group>
      </div>
      <div class="logging-settings__commands">
        <el-button type="primary" :disabled="busy || !levels.length" @click="exportLogs"
          ><el-icon><i-ep-download /></el-icon>导出日志</el-button
        >
      </div>
    </section>
    <section class="logging-settings__section logging-settings__clear" aria-label="日志清理">
      <h3 class="logging-settings__heading">日志清理</h3>
      <el-button type="danger" plain :disabled="busy" @click="clearLogs"
        ><el-icon><i-ep-delete /></el-icon>清空全部日志</el-button
      >
    </section>
    <p v-if="error" class="logging-settings__error" role="alert">{{ error }}</p>
  </div>
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

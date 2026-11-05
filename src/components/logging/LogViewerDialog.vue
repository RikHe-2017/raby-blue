<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { LOG_LEVELS, localDateFilter, todayRange } from '../../logging/model'
  import type { LogEntry, LogLevel, LogPage } from '../../logging/model'
  import { requestLogs } from '../../logging/client'

  defineProps<{ modelValue: boolean }>()
  const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void }>()
  const dates = ref<[string, string]>(todayRange(Date.now()))
  const level = ref<LogLevel>('error')
  const page = ref(1)
  const pageSize = 20
  const entries = ref<LogEntry[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref('')
  let revision = 0

  const load = async (nextPage = page.value) => {
    const current = ++revision
    page.value = nextPage
    loading.value = true
    error.value = ''
    try {
      const result = await requestLogs<LogPage>('page', {
        ...localDateFilter(dates.value),
        level: level.value,
        page: nextPage,
        pageSize
      })
      if (current !== revision) return
      if (nextPage > 1 && !result.entries.length && result.total > 0) {
        await load(Math.ceil(result.total / pageSize))
        return
      }
      entries.value = result.entries
      total.value = result.total
    } catch (reason) {
      if (current !== revision) return
      entries.value = []
      total.value = 0
      error.value = reason instanceof Error ? reason.message : '日志读取失败'
    } finally {
      if (current === revision) loading.value = false
    }
  }

  const formatTime = (timestamp: number) => new Date(timestamp).toLocaleString()
  const formatDetails = (entry: LogEntry) =>
    JSON.stringify({ source: entry.source, details: entry.details }, null, 2)
  watch([dates, level], () => load(1))
  onMounted(() => load(1))
  onBeforeUnmount(() => {
    revision++
  })
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="查看日志"
    width="740px"
    :style="{ maxWidth: 'calc(100vw - 24px)' }"
    top="5vh"
    append-to-body
    :close-on-click-modal="false"
    @update:model-value="value => emit('update:modelValue', value)"
  >
    <div class="log-viewer">
      <div class="log-viewer__filters">
        <el-date-picker
          v-model="dates"
          class="log-viewer__dates"
          type="daterange"
          value-format="YYYY-MM-DD"
          :clearable="false"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          aria-label="日志日期范围"
        />
        <el-select v-model="level" class="log-viewer__level" aria-label="日志等级">
          <el-option v-for="item in LOG_LEVELS" :key="item" :value="item" :label="item" />
        </el-select>
        <el-tooltip content="刷新日志"
          ><el-button :disabled="loading" aria-label="刷新日志" @click="load()"
            ><el-icon><i-ep-refresh /></el-icon></el-button
        ></el-tooltip>
      </div>
      <p v-if="error" class="log-viewer__error" role="alert">{{ error }}</p>
      <el-table
        v-loading="loading"
        :data="entries"
        row-key="id"
        height="300"
        empty-text="没有符合条件的日志"
        class="log-viewer__table"
      >
        <el-table-column type="expand" width="36">
          <template #default="{ row }">
            <pre class="log-viewer__details">{{ formatDetails(row) }}</pre>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="170"
          ><template #default="{ row }">{{ formatTime(row.timestamp) }}</template></el-table-column
        >
        <el-table-column prop="level" label="等级" width="90" />
        <el-table-column prop="message" label="内容" min-width="150" />
      </el-table>
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        :disabled="loading"
        :pager-count="5"
        @current-change="load"
      />
    </div>
  </el-dialog>
</template>

<style scoped lang="scss">
  .log-viewer {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .log-viewer__filters {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .log-viewer__dates {
    flex: 1;
    min-width: 240px;
    max-width: 100%;
  }
  .log-viewer__level {
    width: 110px;
  }
  .log-viewer__error {
    color: var(--el-color-danger);
    overflow-wrap: anywhere;
    margin: 0;
  }
  .log-viewer__details {
    margin: 0;
    padding: 12px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 12px;
  }
  .log-viewer__table :deep(.cell) {
    overflow-wrap: anywhere;
  }
</style>

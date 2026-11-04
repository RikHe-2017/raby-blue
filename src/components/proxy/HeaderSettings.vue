<script lang="ts" setup>
  import SaveStatus from '../common/SaveStatus.vue'
  import type { HeaderSetting } from '../../types/proxy'
  import { createHeaderSetting } from '../../proxy/header-settings.ts'

  const props = defineProps<{
    title: string
    modelValue: HeaderSetting[]
    isSaved: boolean
    error: string
    direction: 'request' | 'response'
  }>()
  const emit = defineEmits<{ (event: 'update:modelValue', value: HeaderSetting[]): void }>()

  const update = (id: string, patch: Partial<HeaderSetting>) => {
    emit(
      'update:modelValue',
      props.modelValue.map(row => (row.id === id ? { ...row, ...patch } : { ...row }))
    )
  }

  const add = () => {
    emit('update:modelValue', [...props.modelValue, createHeaderSetting(crypto.randomUUID())])
  }

  const remove = (id: string) => {
    emit(
      'update:modelValue',
      props.modelValue.filter(row => row.id !== id)
    )
  }

  const suggestions = (query: string, done: (items: { value: string }[]) => void) => {
    const names =
      props.direction === 'request'
        ? [
            'Authorization',
            'Content-Type',
            'Accept',
            'Accept-Language',
            'Cache-Control',
            'X-Requested-With'
          ]
        : [
            'Access-Control-Allow-Origin',
            'Access-Control-Allow-Methods',
            'Access-Control-Allow-Headers',
            'Access-Control-Allow-Credentials',
            'Access-Control-Expose-Headers',
            'Cache-Control',
            'Content-Type',
            'Content-Disposition'
          ]
    done(
      names
        .filter(name => name.toLowerCase().includes(query.toLowerCase()))
        .map(value => ({ value }))
    )
  }
</script>

<template>
  <section class="header-settings" :aria-label="title">
    <div class="header-settings__heading">
      <el-tooltip
        :content="
          direction === 'request'
            ? '仅作用于当前代理的直接目标；文档响应替换配置请求头后，目标地址不能再次跳转。仅支持 HTTP 请求，不包含 WebSocket 握手。'
            : '设置目标返回给浏览器的响应头；删除设置会恢复原响应头。'
        "
      >
        <h4 tabindex="0">{{ title }}</h4>
      </el-tooltip>
      <div class="header-settings__actions">
        <SaveStatus :is-saved="isSaved" />
        <el-tooltip :content="`新增${title === '请求头设置' ? '请求头' : '响应头'}`">
          <el-button text :aria-label="`新增${title}`" @click="add"
            ><el-icon><i-ep-plus /></el-icon
          ></el-button>
        </el-tooltip>
      </div>
    </div>
    <el-table
      v-if="modelValue.length"
      :data="modelValue"
      row-key="id"
      class="header-settings__table"
    >
      <el-table-column label="启用" width="54" align="center">
        <template #default="{ row }">
          <el-checkbox
            :model-value="row.enabled"
            :aria-label="`启用 ${row.name || '新头设置'}`"
            @change="(value: string | number | boolean) => update(row.id, { enabled: !!value })"
          />
        </template>
      </el-table-column>
      <el-table-column label="头名称" min-width="140">
        <template #default="{ row }">
          <el-autocomplete
            :model-value="row.name"
            :fetch-suggestions="suggestions"
            placeholder="Header Name"
            aria-label="头名称"
            @update:model-value="
              (value: string | number) => update(row.id, { name: String(value) })
            "
          />
        </template>
      </el-table-column>
      <el-table-column label="头值" min-width="140">
        <template #default="{ row }">
          <el-input
            :model-value="row.value"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 4 }"
            resize="none"
            aria-label="头值"
            spellcheck="false"
            @update:model-value="value => update(row.id, { value })"
          />
        </template>
      </el-table-column>
      <el-table-column label="处理方式" width="100" align="center">
        <template #default="{ row }">
          <el-select
            :model-value="row.mode ?? 'overwrite'"
            aria-label="头处理方式"
            @update:model-value="
              value => update(row.id, { mode: value === 'merge' ? 'merge' : 'overwrite' })
            "
          >
            <el-option label="覆盖已有" value="overwrite" />
            <el-option label="合并保留" value="merge" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column width="44" align="center">
        <template #default="{ row }">
          <el-tooltip content="删除设置"
            ><el-button text type="danger" aria-label="删除头设置" @click="remove(row.id)"
              ><el-icon><i-ep-delete /></el-icon></el-button
          ></el-tooltip>
        </template>
      </el-table-column>
    </el-table>
    <div v-else class="header-settings__empty">暂无设置</div>
    <p v-if="error" class="header-settings__error" role="alert">{{ error }}</p>
  </section>
</template>

<style lang="scss" scoped>
  .header-settings {
    min-width: 0;
    overflow: hidden;
    border-radius: 4px;
    background: var(--el-bg-color);
  }

  .header-settings__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 40px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--el-border-color);
    background: var(--el-fill-color-light);
  }

  .header-settings__actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 8px;
  }

  .header-settings__table :deep(.el-autocomplete) {
    width: 100%;
  }

  .header-settings__table :deep(.el-select) {
    width: 100%;
  }

  .header-settings__table :deep(.el-table__header),
  .header-settings__table :deep(.el-table__body) {
    width: 100% !important;
    table-layout: fixed;
  }

  .header-settings__table :deep(.cell) {
    padding: 0 6px;
  }

  .header-settings__table :deep(.el-button) {
    padding: 4px;
  }

  .header-settings__empty {
    padding: 16px 8px;
    color: var(--el-text-color-secondary);
    font-size: var(--el-font-size-base);
  }

  .header-settings__error {
    padding: 8px;
    color: var(--el-color-danger);
    overflow-wrap: anywhere;
    font-size: var(--el-font-size-small);
  }
</style>

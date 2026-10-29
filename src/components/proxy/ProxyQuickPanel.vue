<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { ProxyGroup, ProxyNode, ProxyRule } from '../../types/proxy'
  import type { ProxyEntry } from './sidebar-projections'
  import { filterProxyEntries, filterProxyGroups } from './sidebar-projections'
  import FavoriteButton from './FavoriteButton.vue'

  const props = defineProps<{
    entries: ProxyEntry[]
    groups: ProxyGroup[]
    grouped: boolean
    activeItemId: string
    favoritesReady: boolean
    emptyText: string
  }>()
  const emit = defineEmits<{
    (event: 'select', rule: ProxyRule): void
    (event: 'set-enabled', ruleId: string, enabled: boolean): void
    (event: 'set-favorite', ruleId: string, favorite: boolean): void
  }>()
  const searchText = ref('')
  const visibleEntries = computed(() => filterProxyEntries(props.entries, searchText.value))
  const treeGroups = computed(() =>
    filterProxyGroups(
      props.groups,
      visibleEntries.value.map(entry => entry.rule.id)
    )
  )
  const handleNodeClick = (node: ProxyNode) => {
    if (node.type === 'rule') emit('select', node)
  }
</script>

<template>
  <div class="quick-panel__search">
    <el-input
      v-model="searchText"
      placeholder="搜索分类或代理..."
      aria-label="搜索分类或代理"
      clearable
    >
      <template #prefix>
        <el-icon><i-ep-search /></el-icon>
      </template>
    </el-input>
  </div>
  <el-empty
    v-if="!visibleEntries.length"
    :description="searchText.trim() ? '未找到匹配的代理' : emptyText"
    :image-size="40"
  />
  <el-tree
    v-else-if="grouped"
    :data="treeGroups"
    :props="{ label: 'name', children: 'children' }"
    node-key="id"
    default-expand-all
    :expand-on-click-node="true"
    :current-node-key="activeItemId"
    highlight-current
    class="quick-tree"
    @node-click="handleNodeClick"
  >
    <template #default="{ data }">
      <div v-if="data.type === 'rule'" class="quick-rule">
        <el-checkbox
          :model-value="data.enabled"
          :aria-label="`启用 ${data.name}`"
          @click.stop
          @change="value => emit('set-enabled', data.id, value === true)"
        />
        <el-button
          class="quick-rule__name"
          text
          :title="data.name"
          @click.stop="emit('select', data)"
          >{{ data.name }}</el-button
        >
        <FavoriteButton
          :favorite="data.favorite === true"
          :name="data.name"
          :disabled="!favoritesReady"
          @change="value => emit('set-favorite', data.id, value)"
        />
      </div>
      <span v-else class="quick-tree__group" :title="data.name">{{ data.name }}</span>
    </template>
  </el-tree>
  <div v-else class="quick-list">
    <div
      v-for="entry in visibleEntries"
      :key="entry.rule.id"
      class="quick-list__row"
      :class="{ 'quick-list__row--active': entry.rule.id === activeItemId }"
    >
      <el-checkbox
        :model-value="entry.rule.enabled"
        :aria-label="`启用 ${entry.rule.name} · ${entry.path}`"
        @change="value => emit('set-enabled', entry.rule.id, value === true)"
      />
      <el-button class="quick-list__item" text @click="emit('select', entry.rule)">
        <span class="quick-list__text">
          <span class="quick-list__name" :title="entry.rule.name">{{ entry.rule.name }}</span>
          <span class="quick-list__path" :title="entry.path">{{ entry.path }}</span>
        </span>
      </el-button>
      <FavoriteButton
        :favorite="entry.rule.favorite === true"
        :name="entry.rule.name"
        :disabled="!favoritesReady"
        @change="value => emit('set-favorite', entry.rule.id, value)"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .quick-panel__search {
    padding: 4px 8px;
    border-bottom: 1px solid var(--el-border-color);
  }

  .quick-list__row,
  .quick-rule {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    width: 100%;
  }

  .quick-list__row {
    padding: 4px 8px;
    box-sizing: border-box;
    min-height: 52px;
  }

  .quick-list__row--active {
    background: var(--el-color-primary-light-9);
  }

  .quick-list__item {
    flex: 1;
    min-width: 0;
    height: auto;
    justify-content: flex-start;
    padding: 4px;
    margin: 0;
  }

  .quick-list__item :deep(span) {
    min-width: 0;
    max-width: 100%;
  }

  .quick-list__text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    width: 100%;
  }

  .quick-list__name,
  .quick-list__path,
  .quick-tree__group {
    display: block;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .quick-list__path {
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  .quick-rule__name {
    flex: 1;
    min-width: 0;
    justify-content: flex-start;
    padding: 0 4px;
    margin: 0;
    overflow: hidden;
  }

  .quick-rule__name :deep(span) {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .quick-tree :deep(.el-tree-node__content) {
    height: 32px;
  }

  .quick-tree :deep(.el-tree-node__label) {
    min-width: 0;
  }
</style>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import type { ProxyGroup, ProxyNode } from '../../types/proxy'
  import type { ProxyEntry } from './sidebar-projections'
  import { filterProxyEntries, filterProxyGroups } from './sidebar-projections'
  import ProxyTree from './ProxyTree.vue'
  import ProxyList from './ProxyList.vue'

  const props = defineProps<{
    entries: ProxyEntry[]
    groups: ProxyGroup[]
    grouped: boolean
    activeItemId: string
    favoritesReady: boolean
    emptyText: string
  }>()
  const emit = defineEmits<{
    (event: 'select', node: ProxyNode): void
    (event: 'edit-rule', node: ProxyNode): void
    (event: 'set-enabled', ruleId: string, enabled: boolean): void
    (event: 'set-favorite', ruleId: string, favorite: boolean): void
  }>()
  const searchText = ref('')
  const { t } = useI18n()
  const visibleEntries = computed(() => filterProxyEntries(props.entries, searchText.value))
  const treeGroups = computed(() =>
    filterProxyGroups(
      props.groups,
      visibleEntries.value.map(entry => entry.rule.id)
    )
  )
</script>

<template>
  <div class="quick-panel__search">
    <el-input
      v-model="searchText"
      :placeholder="t('proxy.groupOrProxySearch')"
      :aria-label="t('proxy.groupOrProxySearchLabel')"
      clearable
    >
      <template #prefix>
        <el-icon><i-ep-search /></el-icon>
      </template>
    </el-input>
  </div>
  <Empty
    v-if="!visibleEntries.length"
    :description="searchText.trim() ? t('proxy.noMatch') : emptyText"
    :image-size="40"
  />
  <ProxyTree
    v-else-if="grouped"
    :groups="treeGroups"
    :persist-state="false"
    filter-text=""
    :active-item-id="activeItemId"
    :favorites-ready="favoritesReady"
    @node-click="node => emit('select', node)"
    @edit-rule="node => emit('edit-rule', node)"
    @set-enabled="(id, enabled) => emit('set-enabled', id, enabled)"
    @set-favorite="(id, favorite) => emit('set-favorite', id, favorite)"
  />
  <ProxyList
    v-else
    :entries="visibleEntries"
    :active-item-id="activeItemId"
    :favorites-ready="favoritesReady"
    @node-click="node => emit('select', node)"
    @edit-rule="node => emit('edit-rule', node)"
    @set-enabled="(id, enabled) => emit('set-enabled', id, enabled)"
    @set-favorite="(id, favorite) => emit('set-favorite', id, favorite)"
  />
</template>

<style lang="scss" scoped>
  .quick-panel__search {
    padding: 4px 8px;
    border-bottom: 1px solid var(--el-border-color);
  }
</style>

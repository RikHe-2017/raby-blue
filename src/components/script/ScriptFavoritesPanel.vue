<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import ScriptTree from './ScriptTree.vue'
  import ScriptList from './ScriptList.vue'
  import { filterScriptEntries, filterScriptGroups } from './sidebar-projections'
  import type { ScriptEntry } from './sidebar-projections'
  import type { ScriptGroup, ScriptNode } from '../../types/script'

  const props = defineProps<{
    entries: ScriptEntry[]
    groups: ScriptGroup[]
    grouped: boolean
    activeItemId: string
    expandedKeys: string[]
    favoritesReady: boolean
    busy: boolean
  }>()
  defineEmits<{
    (event: 'node-click', node: ScriptNode): void
    (event: 'command', command: string, node: ScriptNode): void
    (event: 'update:expandedKeys', keys: string[]): void
  }>()
  const searchText = ref('')
  const { t } = useI18n()
  const visibleEntries = computed(() => filterScriptEntries(props.entries, searchText.value))
  const treeGroups = computed(() =>
    filterScriptGroups(
      props.groups,
      visibleEntries.value.map(entry => entry.script.id)
    )
  )
</script>

<template>
  <div class="script-favorites__search">
    <el-input
      v-model="searchText"
      :placeholder="t('script.searchPlaceholder')"
      :aria-label="t('script.searchFavoritesLabel')"
      clearable
    >
      <template #prefix
        ><el-icon><i-ep-search /></el-icon
      ></template>
    </el-input>
  </div>
  <Empty
    v-if="!visibleEntries.length"
    :description="searchText.trim() ? t('script.noMatch') : t('script.favoritesEmpty')"
    :image-size="40"
  />
  <ScriptTree
    v-else-if="grouped"
    :groups="treeGroups"
    :source-groups="groups"
    filter-text=""
    :active-item-id="activeItemId"
    :expanded-keys="expandedKeys"
    :favorites-ready="favoritesReady"
    :busy="busy"
    :searching="!!searchText.trim()"
    @node-click="node => $emit('node-click', node)"
    @command="(command, node) => $emit('command', command, node)"
    @update:expanded-keys="keys => $emit('update:expandedKeys', keys)"
  />
  <ScriptList
    v-else
    :entries="visibleEntries"
    :active-item-id="activeItemId"
    :favorites-ready="favoritesReady"
    :busy="busy"
    @node-click="node => $emit('node-click', node)"
    @command="(command, node) => $emit('command', command, node)"
  />
</template>

<style lang="scss" scoped>
  .script-favorites__search {
    padding: 4px 8px;
    border-bottom: 1px solid var(--el-border-color);
  }
</style>

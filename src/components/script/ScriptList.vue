<script setup lang="ts">
  import ScriptNodeContent from './ScriptNodeContent.vue'
  import type { ScriptEntry } from './sidebar-projections'
  import type { ScriptNode } from '../../types/script'

  defineProps<{
    entries: ScriptEntry[]
    activeItemId: string
    favoritesReady: boolean
    busy: boolean
  }>()
  defineEmits<{
    (event: 'node-click', node: ScriptNode): void
    (event: 'command', command: string, node: ScriptNode): void
  }>()
</script>

<template>
  <ul class="script-list">
    <li
      v-for="entry in entries"
      :key="entry.script.id"
      class="script-list__row"
      :class="{ 'script-list__row--active': entry.script.id === activeItemId }"
      :data-node-id="entry.script.id"
      tabindex="0"
      @keydown.enter.self.stop.prevent="$emit('node-click', entry.script)"
      @keydown.space.self.stop.prevent="$emit('node-click', entry.script)"
    >
      <ScriptNodeContent
        :data="entry.script"
        :path="entry.path"
        :active-item-id="activeItemId"
        :favorites-ready="favoritesReady"
        :busy="busy"
        @node-click="node => $emit('node-click', node)"
        @command="(command, node) => $emit('command', command, node)"
      />
    </li>
  </ul>
</template>

<style lang="scss" scoped>
  .script-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .script-list__row {
    display: flex;
    align-items: center;
    min-width: 0;
    padding: 8px;
    border-bottom: 1px solid var(--el-border-color);
  }

  .script-list__row:hover {
    background: var(--el-fill-color-light);
  }

  .script-list__row--active,
  .script-list__row--active:hover {
    background: var(--el-color-primary-light-9);
  }
</style>

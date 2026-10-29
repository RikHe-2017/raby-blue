<script setup lang="ts">
  import type { ProxyNode } from '../../types/proxy'
  import type { ProxyEntry } from './sidebar-projections'
  import ProxyNodeContent from './ProxyNodeContent.vue'
  import { useProxyNodeActions } from './use-proxy-node-actions'

  defineProps<{ entries: ProxyEntry[]; activeItemId: string; favoritesReady: boolean }>()
  const emit = defineEmits<{
    (event: 'node-click', node: ProxyNode): void
    (event: 'edit-rule', node: ProxyNode): void
    (event: 'set-enabled', id: string, enabled: boolean): void
    (event: 'set-favorite', id: string, favorite: boolean): void
  }>()
  const { handleNodeCommand } = useProxyNodeActions(emit)
</script>

<template>
  <ul class="proxy-list">
    <li
      v-for="entry in entries"
      :key="entry.rule.id"
      :data-node-id="entry.rule.id"
      class="proxy-list__row"
      :class="{ 'proxy-list__row--active': entry.rule.id === activeItemId }"
      tabindex="0"
      @keydown.enter.self.stop.prevent="emit('node-click', entry.rule)"
      @keydown.space.self.stop.prevent="emit('node-click', entry.rule)"
    >
      <ProxyNodeContent
        :data="entry.rule"
        :path="entry.path"
        :active-item-id="activeItemId"
        :favorites-ready="favoritesReady"
        @node-click="node => emit('node-click', node)"
        @set-enabled="(id, enabled) => emit('set-enabled', id, enabled)"
        @command="handleNodeCommand"
      />
    </li>
  </ul>
</template>

<style lang="scss" scoped>
  .proxy-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .proxy-list__row {
    display: flex;
    align-items: center;
    min-width: 0;
    padding: 8px;
    border-bottom: 1px solid var(--el-border-color);
    box-sizing: border-box;
  }

  .proxy-list__row:hover {
    background: var(--el-fill-color-light);
  }

  .proxy-list__row--active,
  .proxy-list__row--active:hover {
    background: var(--el-color-primary-light-9);
  }
</style>

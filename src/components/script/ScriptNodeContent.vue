<script setup lang="ts">
  import { computed } from 'vue'
  import type { ScriptNode } from '../../types/script'
  import { getScriptFavoriteSummary } from '../../stores/script-tree'

  const props = defineProps<{
    data: ScriptNode
    activeItemId: string
    favoritesReady: boolean
    busy: boolean
    path?: string
  }>()
  defineEmits<{
    (event: 'node-click', node: ScriptNode): void
    (event: 'command', command: string, node: ScriptNode): void
  }>()
  const summary = computed(() => getScriptFavoriteSummary(props.data))
  const allFavorite = computed(
    () => summary.value.scriptCount > 0 && summary.value.favoriteCount === summary.value.scriptCount
  )
  const favoriteText = computed(() => (allFavorite.value ? '已收藏' : '部分脚本已收藏'))
</script>

<template>
  <div
    class="script-node"
    :class="{ 'script-node--active': data.id === activeItemId }"
    @click.stop="$emit('node-click', data)"
  >
    <div class="script-node__text">
      <span class="script-node__label" :title="data.name">{{ data.name }}</span>
      <span v-if="path" class="script-node__path" :title="path">{{ path }}</span>
    </div>
    <div class="script-node__actions">
      <el-tooltip v-if="summary.favoriteCount > 0" :content="favoriteText" placement="top">
        <span
          class="script-node__favorite"
          role="img"
          :aria-label="`${data.name}：${favoriteText}`"
          @click.stop
        >
          <el-icon><i-ep-star-filled v-if="allFavorite" /><i-ep-star v-else /></el-icon>
        </span>
      </el-tooltip>
      <el-dropdown
        trigger="click"
        :disabled="busy"
        @command="command => $emit('command', command, data)"
      >
        <el-button
          class="script-node__more"
          :aria-label="`${data.name}的操作`"
          title="更多操作"
          text
          circle
          size="small"
          :disabled="busy"
          @click.stop
          @keydown.stop
        >
          <el-icon><i-ep-more-filled /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <template v-if="data.type === 'group'">
              <el-dropdown-item command="category">创建分类</el-dropdown-item>
              <el-dropdown-item command="script">创建脚本</el-dropdown-item>
            </template>
            <template v-else>
              <el-dropdown-item command="duplicate">复制脚本</el-dropdown-item>
              <el-dropdown-item command="edit">编辑脚本</el-dropdown-item>
            </template>
            <el-dropdown-item
              command="favorite"
              :disabled="!favoritesReady || !summary.scriptCount"
            >
              {{ allFavorite ? '取消收藏' : '加入收藏' }}
            </el-dropdown-item>
            <el-dropdown-item command="delete" divided class="script-node__menu-delete">
              {{ data.type === 'group' ? '删除分组' : '删除脚本' }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .script-node {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    min-width: 0;
    padding: 0 4px;
    box-sizing: border-box;
    font-size: var(--el-font-size-base);
  }

  .script-node__text {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .script-node__label,
  .script-node__path {
    display: block;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .script-node__path {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .script-node__actions {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    gap: 4px;
  }

  .script-node__favorite,
  .script-node__more {
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
  }

  .script-node__favorite {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--el-color-warning);
    cursor: default;
  }

  .script-node__menu-delete {
    color: var(--el-color-danger);
  }
</style>

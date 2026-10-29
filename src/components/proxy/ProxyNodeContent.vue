<script setup lang="ts">
  import { computed } from 'vue'
  import type { ProxyNode } from '../../types/proxy'
  import { getProxyFavoriteSummary } from '../../stores/proxy-rules'
  import FavoriteButton from './FavoriteButton.vue'

  const props = withDefaults(
    defineProps<{
      data: ProxyNode
      activeItemId: string
      favoritesReady: boolean
      path?: string
    }>(),
    { path: undefined }
  )
  const emit = defineEmits<{
    (event: 'node-click', node: ProxyNode): void
    (event: 'set-enabled', id: string, enabled: boolean): void
    (event: 'command', command: string, node: ProxyNode): void
  }>()
  const favoriteSummary = computed(() => getProxyFavoriteSummary(props.data))
</script>

<template>
  <div
    class="proxy-node"
    :class="{
      'proxy-node--active':
        (data.type === 'group' && data.id === activeItemId) ||
        (data.type === 'rule' && data.id === activeItemId)
    }"
    @click.stop="emit('node-click', data)"
  >
    <div class="proxy-node__content">
      <!-- 只在代理规则显示复选框 -->
      <el-checkbox
        class="proxy-node__checkbox"
        v-if="data.type === 'rule'"
        :model-value="data.enabled"
        :aria-label="`启用 ${data.name}`"
        @change="value => emit('set-enabled', data.id, value === true)"
        @click.stop
      />
      <div class="proxy-node__text">
        <span class="proxy-node__label">{{ data.name }}</span>
        <span v-if="path" class="proxy-node__path" :title="path">{{ path }}</span>
      </div>
    </div>
    <div class="proxy-node__actions">
      <FavoriteButton
        v-if="favoriteSummary.favoriteCount > 0"
        :favorite="
          favoriteSummary.ruleCount > 0 &&
          favoriteSummary.favoriteCount === favoriteSummary.ruleCount
        "
        :partial="
          favoriteSummary.favoriteCount > 0 &&
          favoriteSummary.favoriteCount < favoriteSummary.ruleCount
        "
        :name="data.name"
        readonly
      />
      <el-dropdown trigger="click" @command="command => emit('command', command, data)">
        <el-button
          class="proxy-node__more"
          :aria-label="`${data.name}的操作`"
          title="更多操作"
          text
          circle
          size="small"
          @click.stop
        >
          <el-icon><i-ep-more-filled /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <template v-if="data.type === 'group'">
              <el-dropdown-item command="category"> 创建分类 </el-dropdown-item>
              <el-dropdown-item command="proxy"> 创建代理 </el-dropdown-item>
            </template>
            <template v-else-if="data.type === 'rule'">
              <el-dropdown-item command="duplicate"> 复制代理 </el-dropdown-item>
              <el-dropdown-item command="edit"> 编辑代理 </el-dropdown-item>
            </template>
            <el-dropdown-item
              command="favorite"
              :disabled="!favoritesReady || !favoriteSummary.ruleCount"
            >
              {{
                favoriteSummary.ruleCount > 0 &&
                favoriteSummary.favoriteCount === favoriteSummary.ruleCount
                  ? '取消收藏'
                  : '加入收藏'
              }}
            </el-dropdown-item>
            <el-dropdown-item command="delete" divided class="proxy-node__menu-delete">
              {{ data.type === 'group' ? '删除分组' : '删除代理' }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .proxy-node {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    min-width: 0;
    padding: 0 4px;
    box-sizing: border-box;
    font-size: var(--el-font-size-base);
  }

  .proxy-node__content {
    display: flex;
    align-items: center;
    flex: 1 1 0;
    gap: 8px;
    min-width: 0;
  }

  .proxy-node__checkbox {
    flex: 0 0 auto;
    margin-right: 0;
  }

  .proxy-node__text {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .proxy-node__label,
  .proxy-node__path {
    display: block;
    min-width: 0;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .proxy-node__path {
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  .proxy-node__actions {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 4px;
  }

  .proxy-node__more {
    width: 24px;
    height: 24px;
  }

  .proxy-node__menu-delete {
    color: var(--el-color-danger);
  }
</style>

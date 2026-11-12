<script setup lang="ts">
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
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
  const isActive = computed(() => props.data.id === props.activeItemId)
  const { t } = useI18n()
</script>

<template>
  <div
    class="proxy-node"
    :class="{
      'proxy-node--active': isActive
    }"
    @click.stop="emit('node-click', data)"
  >
    <div class="proxy-node__content">
      <!-- 只在代理规则显示复选框 -->
      <el-checkbox
        class="proxy-node__checkbox"
        v-if="data.type === 'rule'"
        :model-value="data.enabled"
        :aria-label="t('proxy.enable', { name: data.name })"
        @change="value => emit('set-enabled', data.id, value === true)"
        @click.stop
      />
      <img
        v-if="isActive"
        class="proxy-node__active-icon"
        src="/icons/icon16.png"
        alt=""
        aria-hidden="true"
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
          :aria-label="t('common.nameSuffix', { name: data.name })"
          :title="t('common.moreActions')"
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
              <el-dropdown-item command="category">
                {{ t('proxy.createCategory') }}
              </el-dropdown-item>
              <el-dropdown-item command="proxy"> {{ t('proxy.createProxy') }} </el-dropdown-item>
            </template>
            <template v-else-if="data.type === 'rule'">
              <el-dropdown-item command="duplicate"> {{ t('proxy.copyProxy') }} </el-dropdown-item>
              <el-dropdown-item command="edit"> {{ t('proxy.editProxy') }} </el-dropdown-item>
            </template>
            <el-dropdown-item
              command="favorite"
              :disabled="!favoritesReady || !favoriteSummary.ruleCount"
            >
              {{
                favoriteSummary.ruleCount > 0 &&
                favoriteSummary.favoriteCount === favoriteSummary.ruleCount
                  ? t('proxy.removeFavorite')
                  : t('proxy.addFavorite')
              }}
            </el-dropdown-item>
            <el-dropdown-item command="delete" divided class="proxy-node__menu-delete">
              {{ data.type === 'group' ? t('proxy.deleteGroup') : t('proxy.deleteProxy') }}
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

  .proxy-node--active .proxy-node__label {
    color: var(--el-color-primary);
    font-weight: 600;
  }

  .proxy-node__active-icon {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    object-fit: contain;
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

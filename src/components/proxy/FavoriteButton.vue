<script setup lang="ts">
  import { useI18n } from 'vue-i18n'

  defineProps<{
    favorite: boolean
    name: string
    disabled?: boolean
    readonly?: boolean
    partial?: boolean
  }>()
  defineEmits<{ (event: 'change', favorite: boolean): void }>()
  const { t } = useI18n()
</script>

<template>
  <el-tooltip
    v-if="readonly"
    :content="
      partial
        ? t('proxy.partiallyFavorited')
        : favorite
          ? t('proxy.favorited')
          : t('proxy.favorite')
    "
    placement="top"
  >
    <span
      class="favorite-button favorite-button--readonly"
      :class="{ 'favorite-button--active': favorite || partial }"
      role="img"
      :aria-label="`${name}：${partial ? t('proxy.partiallyFavorited') : favorite ? t('proxy.favorited') : t('proxy.favorite')}`"
      @click.stop
    >
      <el-icon><i-ep-star-filled v-if="favorite" /><i-ep-star v-else /></el-icon>
    </span>
  </el-tooltip>
  <el-tooltip
    v-else
    :content="favorite ? t('proxy.removeFavorite') : t('proxy.addFavorite')"
    placement="top"
  >
    <el-button
      class="favorite-button"
      :class="{ 'favorite-button--active': favorite }"
      :aria-label="`${favorite ? t('proxy.removeFavorite') : t('proxy.favorite')} ${name}`"
      :aria-pressed="favorite"
      :disabled="disabled"
      text
      circle
      size="small"
      @click.stop="$emit('change', !favorite)"
    >
      <el-icon><i-ep-star-filled v-if="favorite" /><i-ep-star v-else /></el-icon>
    </el-button>
  </el-tooltip>
</template>

<style lang="scss" scoped>
  .favorite-button {
    flex: 0 0 24px;
    width: 24px;
    height: 24px;
    color: var(--el-text-color-placeholder);
  }

  .favorite-button--active {
    color: var(--el-color-warning);
  }

  .favorite-button--readonly {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: default;
  }
</style>

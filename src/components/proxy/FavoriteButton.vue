<script setup lang="ts">
  defineProps<{
    favorite: boolean
    name: string
    disabled?: boolean
    readonly?: boolean
    partial?: boolean
  }>()
  defineEmits<{ (event: 'change', favorite: boolean): void }>()
</script>

<template>
  <el-tooltip
    v-if="readonly"
    :content="partial ? '部分代理已收藏' : favorite ? '已收藏' : '未收藏'"
    placement="top"
  >
    <span
      class="favorite-button favorite-button--readonly"
      :class="{ 'favorite-button--active': favorite || partial }"
      role="img"
      :aria-label="`${name}：${partial ? '部分代理已收藏' : favorite ? '已收藏' : '未收藏'}`"
      @click.stop
    >
      <el-icon><i-ep-star-filled v-if="favorite" /><i-ep-star v-else /></el-icon>
    </span>
  </el-tooltip>
  <el-tooltip v-else :content="favorite ? '取消收藏' : '加入收藏'" placement="top">
    <el-button
      class="favorite-button"
      :class="{ 'favorite-button--active': favorite }"
      :aria-label="`${favorite ? '取消收藏' : '收藏'} ${name}`"
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

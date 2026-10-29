<script setup lang="ts">
  defineProps<{ favorite: boolean; name: string; disabled?: boolean }>()
  defineEmits<{ (event: 'change', favorite: boolean): void }>()
</script>

<template>
  <el-tooltip :content="favorite ? '取消收藏' : '加入收藏'" placement="top">
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
</style>

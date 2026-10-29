<script lang="ts" setup>
  defineProps<{
    isSaved: boolean
  }>()
</script>

<template>
  <el-tooltip
    content="停止输入后会自动保存，连续输入会延后保存。请等待显示“已保存”后再切换或关闭页面。"
    :popper-style="{ maxWidth: '240px' }"
  >
    <span class="save-status" role="status" aria-live="polite" tabindex="0">
      <el-icon
        class="save-status__icon"
        :class="{ 'save-status__icon--pending': !isSaved }"
        aria-hidden="true"
      >
        <i-ep-check />
      </el-icon>
      <span>{{ isSaved ? '已保存' : '待保存' }}</span>
    </span>
  </el-tooltip>
</template>

<style lang="scss" scoped>
  .save-status {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    min-width: 52px;
    min-height: 20px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
    font-weight: normal;
    white-space: nowrap;
  }

  .save-status__icon {
    color: var(--el-color-success);
  }

  .save-status__icon--pending {
    visibility: hidden;
  }
</style>

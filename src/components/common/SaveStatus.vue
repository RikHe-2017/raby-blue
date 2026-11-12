<script lang="ts" setup>
  import { useI18n } from 'vue-i18n'

  defineProps<{
    isSaved: boolean
  }>()
  const { t } = useI18n()
</script>

<template>
  <el-tooltip :content="t('common.saveStatusTip')" :popper-style="{ maxWidth: '240px' }">
    <span class="save-status" role="status" aria-live="polite" tabindex="0">
      <el-icon
        class="save-status__icon"
        :class="{ 'save-status__icon--pending': !isSaved }"
        aria-hidden="true"
      >
        <i-ep-check />
      </el-icon>
      <span>{{ isSaved ? t('common.saved') : t('common.pendingSave') }}</span>
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

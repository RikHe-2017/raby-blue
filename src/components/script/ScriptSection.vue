<script lang="ts" setup>
  import ScriptNameEditor from './ScriptNameEditor.vue'
  import ScriptEditor from './ScriptEditor.vue'
  import type { Script } from '../../types/script'

  interface Props {
    activeGroupId: string
    isActiveGroup: boolean
    activeScript: Script | null
    activeItemName: string
    scriptContent: string
    isNameSaved: boolean
    isContentSaved: boolean
  }

  interface Emits {
    (e: 'update:activeItemName', value: string): void
    (e: 'update:scriptContent', value: string): void
    (e: 'script-input', value: string): void
    (e: 'format-script'): void
    (e: 'execute-script'): void
  }

  defineProps<Props>()
  const emit = defineEmits<Emits>()
</script>

<template>
  <div v-if="activeGroupId" class="script-section">
    <!-- 名称编辑区域 -->
    <ScriptNameEditor
      :model-value="activeItemName"
      :is-active-group="isActiveGroup"
      :is-saved="isNameSaved"
      @update:model-value="val => emit('update:activeItemName', val)"
    />

    <!-- 脚本编辑区域 -->
    <div v-if="!isActiveGroup && activeScript" class="script-section__script">
      <ScriptEditor
        :model-value="scriptContent"
        :is-saved="isContentSaved"
        @update:model-value="val => emit('update:scriptContent', val)"
        @input="val => emit('script-input', val)"
        @format="emit('format-script')"
        @execute="emit('execute-script')"
      />
    </div>
  </div>
  <div v-else class="script-section script-section--empty">
    <div class="script-section__empty-content">
      <el-icon class="script-section__empty-icon"><i-ep-document /></el-icon>
      <p class="script-section__empty-text">请选择一个分组或脚本来编辑</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .script-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .script-section--empty {
    justify-content: center;
    align-items: center;
    height: 100%;
  }

  .script-section__empty-content {
    text-align: center;
    padding: calc(var(--el-component-size) * 2);
  }

  .script-section__empty-icon {
    font-size: 64px;
    color: var(--el-text-color-disabled);
    margin-bottom: var(--el-component-size);
    opacity: 0.5;
  }

  .script-section__empty-text {
    color: var(--el-text-color-secondary);
  }
</style>

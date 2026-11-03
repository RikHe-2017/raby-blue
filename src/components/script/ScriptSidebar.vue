<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import ScriptTree from './ScriptTree.vue'
  import ScriptFavoritesPanel from './ScriptFavoritesPanel.vue'
  import { collectScriptEntries } from './sidebar-projections'
  import { useScriptNodeActions } from './use-script-node-actions'
  import { useUserPreferencesStore } from '../../stores/user-preferences'
  import type { ScriptGroup, ScriptNode } from '../../types/script'

  const props = defineProps<{
    groups: ScriptGroup[]
    activeItemId: string
    beforeCommand: () => Promise<void>
  }>()
  const emit = defineEmits<{
    (event: 'select', node: ScriptNode): void
    (event: 'edit-script', node: ScriptNode): void
  }>()
  const preferences = useUserPreferencesStore()
  const sidebar = computed(() => preferences.preferences.scriptSidebar)
  const treeState = computed(() => preferences.preferences.scriptUIState)
  const entries = computed(() => collectScriptEntries(props.groups))
  const favorites = computed(() => entries.value.filter(entry => entry.script.favorite === true))
  const filterText = ref('')
  const { busy, handleAddGroup, handleNodeCommand } = useScriptNodeActions(emit, () =>
    props.beforeCommand()
  )

  const createRootGroup = async () => {
    try {
      await handleAddGroup()
    } catch {
      ElMessage.error('分类保存失败，请重试')
    }
  }
</script>

<template>
  <div class="script-sidebar">
    <div class="script-sidebar__header">
      <span class="script-sidebar__header-title">脚本分组</span>
      <el-dropdown trigger="click" @command="createRootGroup">
        <el-button
          class="script-sidebar__add"
          text
          circle
          size="small"
          title="创建分类"
          aria-label="创建脚本分类"
          :disabled="busy || !preferences.ready"
        >
          <el-icon><i-ep-plus /></el-icon>
        </el-button>
        <template #dropdown
          ><el-dropdown-menu
            ><el-dropdown-item command="category">创建分类</el-dropdown-item></el-dropdown-menu
          ></template
        >
      </el-dropdown>
    </div>
    <el-scrollbar class="script-sidebar__panels">
      <el-collapse
        :model-value="sidebar.openPanels"
        @update:model-value="
          value => preferences.update({ scriptSidebar: { openPanels: value as string[] } })
        "
      >
        <el-collapse-item name="favorites" :disabled="!preferences.ready">
          <template #title>
            <span class="script-sidebar__panel-title">收藏</span>
            <span class="script-sidebar__count">{{ favorites.length }}</span>
            <span class="script-sidebar__mode" @click.stop @keydown.stop>
              <el-switch
                :model-value="sidebar.favoritesGrouped"
                aria-label="收藏脚本分类模式"
                :disabled="!preferences.ready"
                active-text="分类"
                inactive-text="简略"
                size="small"
                @update:model-value="
                  value =>
                    preferences.update({ scriptSidebar: { favoritesGrouped: value === true } })
                "
              />
            </span>
          </template>
          <ScriptFavoritesPanel
            :entries="favorites"
            :groups="groups"
            :grouped="sidebar.favoritesGrouped"
            :active-item-id="activeItemId"
            :expanded-keys="sidebar.favoritesExpandedKeys"
            :favorites-ready="preferences.ready"
            :busy="busy"
            @node-click="node => emit('select', node)"
            @command="handleNodeCommand"
            @update:expanded-keys="
              keys => preferences.update({ scriptSidebar: { favoritesExpandedKeys: keys } })
            "
          />
        </el-collapse-item>
        <el-collapse-item name="config" :disabled="!preferences.ready">
          <template #title>
            <span class="script-sidebar__panel-title">脚本配置</span>
            <span class="script-sidebar__count">{{ entries.length }}</span>
          </template>
          <div class="script-sidebar__search">
            <el-input
              v-model="filterText"
              placeholder="搜索分类或脚本..."
              aria-label="搜索全部脚本"
              clearable
            >
              <template #prefix
                ><el-icon><i-ep-search /></el-icon
              ></template>
            </el-input>
          </div>
          <div class="script-sidebar__tree">
            <ScriptTree
              :groups="groups"
              :source-groups="groups"
              :filter-text="filterText"
              :active-item-id="activeItemId"
              :expanded-keys="treeState.expandedKeys"
              :favorites-ready="preferences.ready"
              :busy="busy"
              @node-click="node => emit('select', node)"
              @command="handleNodeCommand"
              @update:expanded-keys="
                keys => preferences.update({ scriptUIState: { expandedKeys: keys } })
              "
            />
          </div>
        </el-collapse-item>
      </el-collapse>
    </el-scrollbar>
  </div>
</template>

<style lang="scss" scoped>
  .script-sidebar {
    display: flex;
    flex-direction: column;
    flex: 0 0 300px;
    width: 300px;
    min-height: 0;
    background: var(--el-bg-color);
    border-right: 1px solid var(--el-border-color);
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.05);
  }

  .script-sidebar__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    border-bottom: 1px solid var(--el-border-color);
  }

  .script-sidebar__header-title {
    font-size: 14px;
    font-weight: 600;
  }

  .script-sidebar__add {
    width: 24px;
    height: 24px;
  }

  .script-sidebar__panels {
    flex: 1;
    min-height: 0;
  }

  .script-sidebar__panels :deep(.el-collapse-item__header) {
    padding-left: 8px;
  }

  .script-sidebar__panels :deep(.el-collapse-item__title) {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
  }

  .script-sidebar__panels :deep(.el-collapse-item__content) {
    padding-bottom: 8px;
    line-height: 1;
  }

  .script-sidebar__panel-title {
    font-weight: 600;
    white-space: nowrap;
  }

  .script-sidebar__count {
    margin-left: 8px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  .script-sidebar__mode {
    display: inline-flex;
    align-items: center;
    margin-left: auto;
    margin-right: 8px;
  }

  .script-sidebar__search {
    padding: 4px 8px;
    border-bottom: 1px solid var(--el-border-color);
  }

  .script-sidebar__tree {
    overflow: hidden;
    padding-right: 8px;
  }

  .script-sidebar__tree :deep(.el-tree-node__content) {
    display: flex;
    width: 100%;
  }
</style>

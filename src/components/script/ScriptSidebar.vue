<script lang="ts" setup>
  import { ref } from 'vue'
  import ScriptTree from './ScriptTree.vue'
  import type { ScriptGroup } from '../../types/script'

  interface TreeNode {
    id: string
    label: string
    type: 'group' | 'script'
    groupId?: string
    children?: TreeNode[]
  }

  interface Props {
    groups: ScriptGroup[]
    expandedKeys: string[]
    activeItemId: string
  }

  interface Emits {
    (e: 'node-click', data: TreeNode): void
    (e: 'node-expand', data: TreeNode): void
    (e: 'node-collapse', data: TreeNode): void
    (e: 'add-group'): void
    (e: 'add-script'): void
    (e: 'export-config'): void
    (e: 'import-config'): void
    (e: 'duplicate-script', data: TreeNode): void
    (e: 'edit-script', data: TreeNode): void
    (e: 'delete-script', data: TreeNode): void
    (e: 'delete-group', groupId: string): void
  }

  defineProps<Props>()
  const emit = defineEmits<Emits>()

  const filterText = ref('')

  const handleDropdownCommand = (command: string) => {
    if (command === 'category') {
      emit('add-group')
    } else if (command === 'script') {
      emit('add-script')
    }
  }

  const handleExportImportCommand = (command: string) => {
    if (command === 'export') {
      emit('export-config')
    } else if (command === 'import') {
      emit('import-config')
    }
  }

  const handleNodeClick = (data: TreeNode) => {
    emit('node-click', data)
  }

  const handleNodeExpand = (data: TreeNode) => {
    emit('node-expand', data)
  }

  const handleNodeCollapse = (data: TreeNode) => {
    emit('node-collapse', data)
  }

  const handleAddGroup = (_parentId?: string) => {
    emit('add-group')
  }

  const handleAddScript = (_parentId: string) => {
    emit('add-script')
  }

  const handleDuplicateScript = (data: TreeNode) => {
    emit('duplicate-script', data)
  }

  const handleEditScript = (data: TreeNode) => {
    emit('edit-script', data)
  }

  const handleDeleteScript = (data: TreeNode) => {
    emit('delete-script', data)
  }

  const handleDeleteGroup = (groupId: string) => {
    emit('delete-group', groupId)
  }
</script>

<template>
  <div class="sidebar">
    <div class="sidebar__header">
      <div class="sidebar__header-title">脚本分组</div>
      <div class="sidebar__header-actions">
        <el-dropdown @command="handleDropdownCommand">
          <el-icon class="sidebar__header-icon sidebar__header-icon--add">
            <i-ep-plus />
          </el-icon>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="category"> 创建分类 </el-dropdown-item>
              <el-dropdown-item command="script"> 创建脚本 </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-dropdown @command="handleExportImportCommand">
          <el-icon class="sidebar__header-icon sidebar__header-icon--export-import">
            <i-ep-setting />
          </el-icon>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="export"> 导出配置 </el-dropdown-item>
              <el-dropdown-item command="import"> 导入配置 </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <!-- 搜索框 -->
    <div class="sidebar__search">
      <el-input
        v-model="filterText"
        placeholder="搜索分类或脚本..."
        class="sidebar__search-input"
        clearable
      >
        <template #prefix>
          <el-icon><i-ep-search /></el-icon>
        </template>
      </el-input>
    </div>

    <el-scrollbar class="sidebar__tree">
      <ScriptTree
        :groups="groups"
        :filter-text="filterText"
        :expanded-keys="expandedKeys"
        :active-item-id="activeItemId"
        @node-click="handleNodeClick"
        @node-expand="handleNodeExpand"
        @node-collapse="handleNodeCollapse"
        @add-group="handleAddGroup"
        @add-script="handleAddScript"
        @duplicate-script="handleDuplicateScript"
        @edit-script="handleEditScript"
        @delete-script="handleDeleteScript"
        @delete-group="handleDeleteGroup"
      />
    </el-scrollbar>
  </div>
</template>

<style lang="scss" scoped>
  .sidebar {
    width: 300px;
    background: var(--el-bg-color);
    border-right: 1px solid var(--el-border-color);
    display: flex;
    flex-direction: column;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.05);
  }

  .sidebar__header {
    padding: 4px 8px;
    border-bottom: 1px solid var(--el-border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;

    .sidebar__header-title {
      font-size: 14px;
      font-weight: 600;
    }
  }

  .sidebar__header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .sidebar__header-icon {
    cursor: pointer;
    transition: all 0.3s;
    border-radius: var(--el-border-radius-small);

    &:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: scale(1.1);
    }
  }

  .sidebar__search {
    padding: 4px 8px;
    border-bottom: 1px solid var(--el-border-color);
  }

  .sidebar__tree {
    flex: 1;
    overflow: hidden;
    padding-right: 8px;

    :deep(.el-tree-node__content) {
      width: 100%;
      display: flex;
    }
  }
</style>

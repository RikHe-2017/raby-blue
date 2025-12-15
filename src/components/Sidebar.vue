<script lang="ts" setup>
  import { ref } from 'vue'
  import ProxyTree from './ProxyTree.vue'
  import type { ProxyGroup } from '../types/proxy'

  interface TreeNode {
    id: string
    label: string
    type: 'group' | 'rule'
    enabled?: boolean
    sourceUrl?: string
    targetUrl?: string
    groupId?: string
    children?: TreeNode[]
  }

  interface Props {
    groups: ProxyGroup[]
    expandedKeys: string[]
    activeItemId: string
  }

  interface Emits {
    (e: 'node-click', data: TreeNode): void
    (e: 'node-expand', data: TreeNode): void
    (e: 'node-collapse', data: TreeNode): void
    (e: 'checkbox-change', data: TreeNode): void
    (e: 'add-group'): void
    (e: 'add-proxy'): void
    (e: 'export-config'): void
    (e: 'import-config'): void
    (e: 'duplicate-rule', data: TreeNode): void
    (e: 'edit-rule', data: TreeNode): void
    (e: 'delete-rule', data: TreeNode): void
    (e: 'delete-group', groupId: string): void
  }

  const props = defineProps<Props>()
  const emit = defineEmits<Emits>()

  const filterText = ref('')

  const handleDropdownCommand = (command: string) => {
    if (command === 'category') {
      emit('add-group')
    } else if (command === 'proxy') {
      emit('add-proxy')
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

  const handleCheckboxChange = (data: TreeNode) => {
    emit('checkbox-change', data)
  }

  const handleAddGroup = (parentId?: string) => {
    // ProxyTree 传递的 parentId 暂时不使用，App.vue 会根据当前选中状态处理
    emit('add-group')
  }

  const handleAddProxy = (parentId: string) => {
    // ProxyTree 传递的 parentId 暂时不使用，App.vue 会根据当前选中状态处理
    emit('add-proxy')
  }

  const handleDuplicateRule = (data: TreeNode) => {
    emit('duplicate-rule', data)
  }

  const handleEditRule = (data: TreeNode) => {
    emit('edit-rule', data)
  }

  const handleDeleteRule = (data: TreeNode) => {
    emit('delete-rule', data)
  }

  const handleDeleteGroup = (groupId: string) => {
    emit('delete-group', groupId)
  }
</script>

<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <h3>代理分组</h3>
      <div class="header-actions">
        <el-dropdown @command="handleDropdownCommand">
          <el-icon class="add-icon">
            <Plus />
          </el-icon>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="category"> 创建分类 </el-dropdown-item>
              <el-dropdown-item command="proxy"> 创建代理 </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-dropdown @command="handleExportImportCommand">
          <el-icon class="export-import-icon">
            <Setting />
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
    <div class="search-container">
      <el-input v-model="filterText" placeholder="搜索分类或代理..." class="search-input" clearable>
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
    </div>

    <el-scrollbar class="tree-container">
      <ProxyTree
        :groups="groups"
        :filter-text="filterText"
        :expanded-keys="expandedKeys"
        :active-item-id="activeItemId"
        @node-click="handleNodeClick"
        @node-expand="handleNodeExpand"
        @node-collapse="handleNodeCollapse"
        @checkbox-change="handleCheckboxChange"
        @add-group="handleAddGroup"
        @add-proxy="handleAddProxy"
        @duplicate-rule="handleDuplicateRule"
        @edit-rule="handleEditRule"
        @delete-rule="handleDeleteRule"
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

    .sidebar-header {
      padding: var(--el-component-size) var(--el-component-size-small);
      border-bottom: 1px solid var(--el-border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;

      h3 {
        margin: 0;
        color: white;
      }

      .header-actions {
        display: flex;
        gap: var(--el-component-size-small);
        align-items: center;

        .add-icon,
        .export-import-icon {
          color: rgba(255, 255, 255, 0.9);
          cursor: pointer;
          transition: all 0.3s;
          padding: 4px;
          border-radius: var(--el-border-radius-small);

          &:hover {
            color: white;
            background: rgba(255, 255, 255, 0.2);
            transform: scale(1.1);
          }
        }
      }
    }

    .search-container {
      padding: var(--el-component-size-small);
      border-bottom: 1px solid var(--el-border-color);
    }

    .tree-container {
      flex: 1;
      overflow: hidden;

      :deep(.el-tree-node__content) {
        width: 100%;
        display: flex;
      }
    }
  }
</style>

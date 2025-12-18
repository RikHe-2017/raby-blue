<script lang="ts" setup>
  import { ref } from 'vue'
  import ProxyTree from './ProxyTree.vue'
  import type { ProxyGroup, ProxyNode } from '../../types/proxy'

  interface Props {
    groups: ProxyGroup[]
    expandedKeys: string[]
    activeItemId: string
  }

  interface Emits {
    (e: 'node-click', data: ProxyNode): void
    (e: 'node-expand', data: ProxyNode): void
    (e: 'node-collapse', data: ProxyNode): void
    (e: 'checkbox-change', data: ProxyNode): void
    (e: 'add-group'): void
    (e: 'add-proxy'): void
    (e: 'export-config'): void
    (e: 'import-config'): void
    (e: 'duplicate-rule', data: ProxyNode): void
    (e: 'edit-rule', data: ProxyNode): void
    (e: 'delete-rule', data: ProxyNode): void
    (e: 'delete-group', groupId: string): void
  }

  defineProps<Props>()
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

  const handleNodeClick = (data: ProxyNode) => {
    emit('node-click', data)
  }

  const handleNodeExpand = (data: ProxyNode) => {
    emit('node-expand', data)
  }

  const handleNodeCollapse = (data: ProxyNode) => {
    emit('node-collapse', data)
  }

  const handleCheckboxChange = (data: ProxyNode) => {
    emit('checkbox-change', data)
  }

  const handleAddGroup = (_parentId?: string) => {
    // ProxyTree 传递的 parentId 暂时不使用，App.vue 会根据当前选中状态处理
    emit('add-group')
  }

  const handleAddProxy = (_parentId: string) => {
    // ProxyTree 传递的 parentId 暂时不使用，App.vue 会根据当前选中状态处理
    emit('add-proxy')
  }

  const handleDuplicateRule = (data: ProxyNode) => {
    emit('duplicate-rule', data)
  }

  const handleEditRule = (data: ProxyNode) => {
    emit('edit-rule', data)
  }

  const handleDeleteRule = (data: ProxyNode) => {
    emit('delete-rule', data)
  }

  const handleDeleteGroup = (groupId: string) => {
    emit('delete-group', groupId)
  }
</script>

<template>
  <div class="sidebar">
    <div class="sidebar__header">
      <div class="sidebar__header-title">代理分组</div>
      <div class="sidebar__header-actions">
        <el-dropdown @command="handleDropdownCommand">
          <el-icon class="sidebar__header-icon sidebar__header-icon--add">
            <i-ep-plus />
          </el-icon>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="category"> 创建分类 </el-dropdown-item>
              <el-dropdown-item command="proxy"> 创建代理 </el-dropdown-item>
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
        placeholder="搜索分类或代理..."
        class="sidebar__search-input"
        clearable
      >
        <template #prefix>
          <el-icon><i-ep-search /></el-icon>
        </template>
      </el-input>
    </div>

    <el-scrollbar class="sidebar__tree">
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

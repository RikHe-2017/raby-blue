<script lang="ts" setup>
  import { ref } from 'vue'
  import ScriptTree from './ScriptTree.vue'
  import { useScriptStore } from '../../stores/script'
  import type { ScriptGroup, ScriptNode, Script } from '../../types/script'

  interface Props {
    groups: ScriptGroup[]
    activeGroupId: string
  }

  interface Emits {
    (e: 'update:activeGroupId', value: string): void
    (e: 'update:activeItemId', value: string): void
    (e: 'edit-script', data: ScriptNode): void
  }

  const props = defineProps<Props>()
  const emit = defineEmits<Emits>()

  const scriptStore = useScriptStore()
  const filterText = ref('')

  // Header 下拉菜单：创建顶级分组或脚本
  const handleDropdownCommand = (command: string) => {
    if (command === 'category') {
      const newGroup: ScriptGroup = {
        id: crypto.randomUUID(),
        name: '新分类',
        type: 'group',
        children: []
      }
      scriptStore.addGroup(newGroup)
    } else if (command === 'script') {
      const groupId = props.activeGroupId
      if (!groupId) {
        // 如果没有选中分组，先创建一个默认分组
        const newGroup: ScriptGroup = {
          id: crypto.randomUUID(),
          name: '新分类',
          type: 'group',
          children: []
        }
        scriptStore.addGroup(newGroup)
        return
      }
      const newScript: Script = {
        id: crypto.randomUUID(),
        name: '新脚本',
        content: '// 请输入你的JS代码',
        groupId,
        type: 'script'
      }
      scriptStore.addScript(groupId, newScript)
    }
  }

  const handleNodeClick = (data: ScriptNode) => {
    // 直接处理节点点击逻辑，更新父组件的 UI 状态
    if (data.type === 'group') {
      emit('update:activeGroupId', data.id)
      emit('update:activeItemId', data.id)
    } else if (data.type === 'script') {
      emit('update:activeGroupId', data.groupId)
      emit('update:activeItemId', data.id)
    }
  }

  const handleEditScript = (data: ScriptNode) => {
    emit('edit-script', data)
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
        @node-click="handleNodeClick"
        @edit-script="handleEditScript"
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

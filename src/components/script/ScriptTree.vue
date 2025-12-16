<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import type { TreeInstance } from 'element-plus'
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
    filterText: string
    expandedKeys: string[]
    activeItemId: string
  }

  interface Emits {
    (e: 'node-click', data: TreeNode): void
    (e: 'node-expand', data: TreeNode): void
    (e: 'node-collapse', data: TreeNode): void
    (e: 'add-group', parentId?: string): void
    (e: 'add-script', parentId: string): void
    (e: 'duplicate-script', data: TreeNode): void
    (e: 'edit-script', data: TreeNode): void
    (e: 'delete-script', data: TreeNode): void
    (e: 'delete-group', groupId: string): void
  }

  const props = defineProps<Props>()
  const emit = defineEmits<Emits>()

  const treeRef = ref<TreeInstance>()

  const treeProps = {
    children: 'children',
    label: 'label'
  }

  // 递归构建树形数据结构
  const buildTreeData = (groups: ScriptGroup[]): TreeNode[] => {
    return groups.map(group => ({
      id: group.id,
      label: group.name,
      type: 'group' as const,
      children: [
        // 子分组
        ...(group.children ? buildTreeData(group.children) : []),
        // 脚本文件
        ...group.scripts.map(script => ({
          id: script.id,
          label: script.name,
          type: 'script' as const,
          groupId: group.id
        }))
      ]
    }))
  }

  const treeData = computed(() => buildTreeData(props.groups))

  // 节点过滤方法
  const filterNode = (value: string, data: TreeNode) => {
    if (!value) return true
    return data.label.toLowerCase().includes(value.toLowerCase())
  }

  watch(
    () => props.filterText,
    val => {
      treeRef.value?.filter(val)
    }
  )

  const handleNodeClick = (data: TreeNode) => {
    emit('node-click', data)
  }

  const handleNodeExpand = (data: TreeNode) => {
    emit('node-expand', data)
  }

  const handleNodeCollapse = (data: TreeNode) => {
    emit('node-collapse', data)
  }

  const handleDropdownCommand = (command: string, parentData: TreeNode) => {
    if (command === 'category') {
      emit('add-group', parentData.id)
    } else if (command === 'script') {
      emit('add-script', parentData.id)
    }
  }

  const handleScriptDropdownCommand = (command: string, scriptData: TreeNode) => {
    if (command === 'duplicate') {
      emit('duplicate-script', scriptData)
    } else if (command === 'edit') {
      emit('edit-script', scriptData)
    } else if (command === 'delete') {
      emit('delete-script', scriptData)
    }
  }

  const handleDeleteGroup = (groupId: string) => {
    emit('delete-group', groupId)
  }
</script>

<template>
  <el-tree
    ref="treeRef"
    :data="treeData"
    :props="treeProps"
    node-key="id"
    :default-expanded-keys="expandedKeys"
    :current-node-key="activeItemId"
    :expand-on-click-node="false"
    highlight-current
    :filter-node-method="filterNode as any"
    @node-expand="handleNodeExpand"
    @node-collapse="handleNodeCollapse"
  >
    <template #default="{ node, data }">
      <div
        class="tree-node"
        :class="{
          'tree-node--active':
            (data.type === 'group' && data.id === activeItemId) ||
            (data.type === 'script' && data.id === activeItemId)
        }"
        @click.stop="handleNodeClick(data)"
      >
        <div class="tree-node__content">
          <span class="tree-node__label">{{ node.label }}</span>
        </div>
        <div class="tree-node__actions">
          <!-- 分组节点的操作 -->
          <template v-if="data.type === 'group'">
            <el-dropdown @command="command => handleDropdownCommand(command, data)">
              <el-icon class="tree-node__action-icon tree-node__action-icon--add">
                <i-ep-plus />
              </el-icon>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="category"> 创建分类 </el-dropdown-item>
                  <el-dropdown-item command="script"> 创建脚本 </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-icon
              class="tree-node__action-icon tree-node__action-icon--delete"
              @click.stop="handleDeleteGroup(data.id)"
            >
              <i-ep-delete />
            </el-icon>
          </template>

          <!-- 脚本文件的操作 -->
          <template v-else-if="data.type === 'script'">
            <el-dropdown @command="command => handleScriptDropdownCommand(command, data)">
              <el-icon class="tree-node__action-icon tree-node__action-icon--add">
                <i-ep-plus />
              </el-icon>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="duplicate"> 复制脚本 </el-dropdown-item>
                  <el-dropdown-item command="edit"> 编辑脚本 </el-dropdown-item>
                  <el-dropdown-item command="delete" divided> 删除脚本 </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </div>
      </div>
    </template>
  </el-tree>
</template>

<style lang="scss" scoped>
  .tree-node {
    width: 100%;
    padding: 0 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .tree-node__content {
    flex: 1;
    display: flex;
    align-items: center;
  }

  .tree-node__actions {
    flex-shrink: 0;
    display: flex;
    gap: 4px;
  }

  .tree-node__action-icon {
    display: flex;
    align-items: center;
    cursor: pointer;
    border-radius: var(--el-border-radius-small);
    transition: all 0.2s;

    &:hover {
      background-color: var(--el-fill-color-light);
    }
  }

  .tree-node__action-icon--add {
    color: var(--el-color-primary);
  }

  .tree-node__action-icon--delete {
    color: var(--el-color-danger);
  }
</style>

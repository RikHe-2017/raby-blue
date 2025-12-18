<script lang="ts" setup>
  import { ref, watch } from 'vue'
  import type { TreeInstance } from 'element-plus'
  import type { ScriptGroup, ScriptNode } from '../../types/script'

  interface Props {
    groups: ScriptGroup[]
    filterText: string
    expandedKeys: string[]
    activeItemId: string
  }

  interface Emits {
    (e: 'node-click', data: ScriptNode): void
    (e: 'node-expand', data: ScriptNode): void
    (e: 'node-collapse', data: ScriptNode): void
    (e: 'add-group', parentId?: string): void
    (e: 'add-script', parentId: string): void
    (e: 'duplicate-script', data: ScriptNode): void
    (e: 'edit-script', data: ScriptNode): void
    (e: 'delete-script', data: ScriptNode): void
    (e: 'delete-group', groupId: string): void
  }

  const props = defineProps<Props>()
  const emit = defineEmits<Emits>()

  const treeRef = ref<TreeInstance>()

  // el-tree 配置：直接使用 name 字段作为 label，children 字段作为子节点
  const treeProps = {
    children: 'children',
    label: 'name' // 直接使用 ScriptGroup/Script 的 name 字段
  }

  // 节点过滤方法
  // Element Plus Tree 的 filterNodeMethod 类型: (value: FilterValue, data: TreeNodeData, child: Node) => boolean
  // TreeNodeData 是 Record<string, any>，我们的 ScriptNode 符合这个类型
  const filterNode = (value: string, data: Record<string, unknown>): boolean => {
    if (!value) return true
    const node = data as unknown as ScriptNode
    return node.name.toLowerCase().includes(value.toLowerCase())
  }

  watch(
    () => props.filterText,
    val => {
      treeRef.value?.filter(val)
    }
  )

  const handleNodeClick = (data: ScriptNode) => {
    emit('node-click', data)
  }

  const handleNodeExpand = (data: ScriptNode) => {
    emit('node-expand', data)
  }

  const handleNodeCollapse = (data: ScriptNode) => {
    emit('node-collapse', data)
  }

  const handleDropdownCommand = (command: string, parentData: ScriptNode) => {
    if (command === 'category') {
      emit('add-group', parentData.id)
    } else if (command === 'script') {
      emit('add-script', parentData.id)
    }
  }

  const handleScriptDropdownCommand = (command: string, scriptData: ScriptNode) => {
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
    :data="groups"
    :props="treeProps"
    node-key="id"
    :default-expanded-keys="expandedKeys"
    :current-node-key="activeItemId"
    :expand-on-click-node="false"
    highlight-current
    :filter-node-method="filterNode"
    @node-expand="handleNodeExpand"
    @node-collapse="handleNodeCollapse"
  >
    <template #default="{ data }">
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
          <span class="tree-node__label">{{ data.name }}</span>
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

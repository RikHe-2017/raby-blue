<script lang="ts" setup>
  import { ref, watch } from 'vue'
  import type { TreeInstance } from 'element-plus'
  import type { ProxyGroup, ProxyNode } from '../../types/proxy'

  interface Props {
    groups: ProxyGroup[]
    filterText: string
    expandedKeys: string[]
    activeItemId: string
  }

  interface Emits {
    (e: 'node-click', data: ProxyNode): void
    (e: 'node-expand', data: ProxyNode): void
    (e: 'node-collapse', data: ProxyNode): void
    (e: 'checkbox-change', data: ProxyNode): void
    (e: 'add-group', parentId?: string): void
    (e: 'add-proxy', parentId: string): void
    (e: 'duplicate-rule', data: ProxyNode): void
    (e: 'edit-rule', data: ProxyNode): void
    (e: 'delete-rule', data: ProxyNode): void
    (e: 'delete-group', groupId: string): void
  }

  const props = defineProps<Props>()
  const emit = defineEmits<Emits>()

  const treeRef = ref<TreeInstance>()

  // el-tree 配置：直接使用 name 字段作为 label，children 字段作为子节点
  const treeProps = {
    children: 'children',
    label: 'name' // 直接使用 ProxyGroup/ProxyRule 的 name 字段
  }

  // 节点过滤方法
  // Element Plus Tree 的 filterNodeMethod 类型: (value: FilterValue, data: TreeNodeData, child: Node) => boolean
  // TreeNodeData 是 Record<string, any>，我们的 ProxyNode 符合这个类型
  const filterNode = (value: string, data: Record<string, unknown>): boolean => {
    if (!value) return true
    const node = data as unknown as ProxyNode
    return node.name.toLowerCase().includes(value.toLowerCase())
  }

  watch(
    () => props.filterText,
    val => {
      treeRef.value?.filter(val)
    }
  )

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

  const handleDropdownCommand = (command: string, parentData: ProxyNode) => {
    if (command === 'category') {
      emit('add-group', parentData.id)
    } else if (command === 'proxy') {
      emit('add-proxy', parentData.id)
    }
  }

  const handleRuleDropdownCommand = (command: string, ruleData: ProxyNode) => {
    if (command === 'duplicate') {
      emit('duplicate-rule', ruleData)
    } else if (command === 'edit') {
      emit('edit-rule', ruleData)
    } else if (command === 'delete') {
      emit('delete-rule', ruleData)
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
    <template #default="{ node, data }">
      <div
        class="tree-node"
        :class="{
          'tree-node--active':
            (data.type === 'group' && data.id === activeItemId) ||
            (data.type === 'rule' && data.id === activeItemId)
        }"
        @click.stop="handleNodeClick(data)"
      >
        <div class="tree-node__content">
          <!-- 只在代理规则显示复选框 -->
          <el-checkbox
            v-if="data.type === 'rule'"
            :model-value="data.enabled"
            @change="handleCheckboxChange(data)"
            @click.stop
            style="margin-right: 4px"
          />
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
                  <el-dropdown-item command="proxy"> 创建代理 </el-dropdown-item>
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

          <!-- 叶子节点（代理规则）的操作 -->
          <template v-else-if="data.type === 'rule'">
            <el-dropdown @command="command => handleRuleDropdownCommand(command, data)">
              <el-icon class="tree-node__action-icon tree-node__action-icon--add">
                <i-ep-plus />
              </el-icon>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="duplicate"> 复制代理 </el-dropdown-item>
                  <el-dropdown-item command="edit"> 编辑代理 </el-dropdown-item>
                  <el-dropdown-item command="delete" divided> 删除代理 </el-dropdown-item>
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

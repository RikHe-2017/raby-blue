<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import type { TreeInstance } from 'element-plus'
  import type { ProxyGroup, ProxyRule } from '../../types/proxy'

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
    filterText: string
    expandedKeys: string[]
    activeItemId: string
  }

  interface Emits {
    (e: 'node-click', data: TreeNode): void
    (e: 'node-expand', data: TreeNode): void
    (e: 'node-collapse', data: TreeNode): void
    (e: 'checkbox-change', data: TreeNode): void
    (e: 'add-group', parentId?: string): void
    (e: 'add-proxy', parentId: string): void
    (e: 'duplicate-rule', data: TreeNode): void
    (e: 'edit-rule', data: TreeNode): void
    (e: 'delete-rule', data: TreeNode): void
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
  const buildTreeData = (groups: ProxyGroup[]): TreeNode[] => {
    return groups.map(group => ({
      id: group.id,
      label: group.name,
      type: 'group' as const,
      enabled: group.enabled,
      children: [
        // 子分组
        ...(group.children ? buildTreeData(group.children) : []),
        // 代理规则
        ...group.rules.map((rule: ProxyRule) => ({
          id: rule.id,
          label: rule.name,
          type: 'rule' as const,
          enabled: rule.enabled,
          sourceUrl: rule.sourceUrl,
          targetUrl: rule.targetUrl,
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

  const handleCheckboxChange = (data: TreeNode) => {
    emit('checkbox-change', data)
  }

  const handleDropdownCommand = (command: string, parentData: TreeNode) => {
    if (command === 'category') {
      emit('add-group', parentData.id)
    } else if (command === 'proxy') {
      emit('add-proxy', parentData.id)
    }
  }

  const handleRuleDropdownCommand = (command: string, ruleData: TreeNode) => {
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

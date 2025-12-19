<script lang="ts" setup>
  import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
  import { ElMessage } from 'element-plus'
  import type { TreeInstance } from 'element-plus'
  import { useProxyStore } from '../../stores/proxy'
  import type { ProxyGroup, ProxyNode, ProxyRule } from '../../types/proxy'
  import { isProxyRule, isProxyGroup } from '../../types/proxy'

  interface Props {
    groups: ProxyGroup[]
    filterText: string
  }

  interface Emits {
    (e: 'node-click', data: ProxyNode): void
    (e: 'edit-rule', data: ProxyNode): void
  }

  const props = defineProps<Props>()
  const emit = defineEmits<Emits>()

  const proxyStore = useProxyStore()
  const treeRef = ref<TreeInstance>()

  // Tree 自己管理展开和选中状态
  const expandedKeys = ref<string[]>([])
  const activeItemId = ref<string>('')
  let uiStateSaveTimer: ReturnType<typeof setTimeout> | null = null

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

  // 收集所有分组ID
  const collectAllGroupIds = (groups: ProxyGroup[]): string[] => {
    const ids: string[] = []
    groups.forEach(group => {
      ids.push(group.id)
      const childGroups = group.children.filter(isProxyGroup)
      if (childGroups.length > 0) {
        ids.push(...collectAllGroupIds(childGroups))
      }
    })
    return ids
  }

  // 保存 UI 状态（防抖）
  const saveUIState = () => {
    if (uiStateSaveTimer) {
      clearTimeout(uiStateSaveTimer)
    }
    uiStateSaveTimer = setTimeout(() => {
      proxyStore.uiState.expandedKeys = [...expandedKeys.value]
      proxyStore.uiState.activeItemId = activeItemId.value
      proxyStore.saveUIState()
    }, 300)
  }

  // 初始化：加载保存的 UI 状态
  onMounted(async () => {
    await proxyStore.loadUIState()
    await nextTick()

    // 恢复展开状态
    const savedExpandedKeys = Array.isArray(proxyStore.uiState.expandedKeys)
      ? [...proxyStore.uiState.expandedKeys]
      : []

    if (savedExpandedKeys.length > 0) {
      // 过滤掉不存在的节点ID
      const allGroupIds = collectAllGroupIds(props.groups)
      const validExpandedKeys = savedExpandedKeys.filter(id => allGroupIds.includes(id))
      expandedKeys.value = validExpandedKeys.length > 0 ? validExpandedKeys : allGroupIds
    } else {
      // 默认展开所有节点
      expandedKeys.value = collectAllGroupIds(props.groups)
    }

    // 恢复选中状态
    if (proxyStore.uiState.activeItemId) {
      activeItemId.value = proxyStore.uiState.activeItemId
      await nextTick()
      treeRef.value?.setCurrentKey(activeItemId.value)
    }
  })

  // 组件卸载前保存状态
  onUnmounted(() => {
    if (uiStateSaveTimer) {
      clearTimeout(uiStateSaveTimer)
    }
    proxyStore.uiState.expandedKeys = [...expandedKeys.value]
    proxyStore.uiState.activeItemId = activeItemId.value
    proxyStore.saveUIState()
  })

  watch(
    () => props.filterText,
    val => {
      treeRef.value?.filter(val)
    }
  )

  // 监听 groups 变化，更新 expandedKeys（过滤无效ID）
  watch(
    () => props.groups,
    () => {
      const allGroupIds = collectAllGroupIds(props.groups)
      expandedKeys.value = expandedKeys.value.filter(id => allGroupIds.includes(id))
    },
    {
      deep: true
    }
  )

  // 监听展开状态变化，保存
  watch(
    expandedKeys,
    () => {
      saveUIState()
    },
    {
      deep: true
    }
  )

  // 监听选中状态变化，保存
  watch(activeItemId, () => {
    saveUIState()
  })

  // 节点点击 - 更新选中状态并通知父组件
  const handleNodeClick = (data: ProxyNode) => {
    activeItemId.value = data.id
    // :current-node-key 绑定会自动更新树的选中状态，不需要手动调用 setCurrentKey
    // 通知 Sidebar 更新内容区域状态
    emit('node-click', data)
  }

  // 节点展开 - 更新展开状态
  const handleNodeExpand = (data: ProxyNode) => {
    if (!expandedKeys.value.includes(data.id)) {
      expandedKeys.value.push(data.id)
    }
  }

  // 节点折叠 - 更新展开状态
  const handleNodeCollapse = (data: ProxyNode) => {
    const index = expandedKeys.value.indexOf(data.id)
    if (index > -1) {
      expandedKeys.value.splice(index, 1)
    }
  }

  // 复选框变更 - 直接处理
  const handleCheckboxChange = (data: ProxyNode) => {
    if (isProxyRule(data)) {
      proxyStore.updateRule(data.groupId, data.id, { enabled: !data.enabled })
    }
  }

  // 添加分组 - 直接处理
  const handleAddGroup = (parentId?: string) => {
    const newGroup: ProxyGroup = {
      id: crypto.randomUUID(),
      name: '新分类',
      enabled: false,
      type: 'group',
      children: []
    }
    proxyStore.addGroup(newGroup, parentId)
  }

  // 添加代理规则 - 直接处理
  const handleAddProxy = (parentId: string) => {
    const newRule: ProxyRule = {
      id: crypto.randomUUID(),
      name: '新代理',
      sourceUrl: '',
      targetUrl: '',
      enabled: false,
      groupId: parentId,
      type: 'rule'
    }
    proxyStore.addRule(parentId, newRule)
  }

  // 分组下拉菜单命令处理
  const handleDropdownCommand = (command: string, parentData: ProxyNode) => {
    if (command === 'category') {
      handleAddGroup(parentData.id)
    } else if (command === 'proxy') {
      handleAddProxy(parentData.id)
    }
  }

  // 复制规则 - 直接处理
  const handleDuplicateRule = (ruleData: ProxyNode) => {
    if (!isProxyRule(ruleData)) return
    const duplicatedRule: ProxyRule = {
      id: crypto.randomUUID(),
      name: `${ruleData.name} - 副本`,
      sourceUrl: ruleData.sourceUrl || '',
      targetUrl: ruleData.targetUrl || '',
      enabled: false,
      groupId: ruleData.groupId,
      type: 'rule'
    }
    proxyStore.addRule(ruleData.groupId, duplicatedRule)
  }

  // 编辑规则 - 需要通知父组件切换到编辑模式
  const handleEditRule = (ruleData: ProxyNode) => {
    emit('edit-rule', ruleData)
  }

  // 删除规则 - 直接处理
  const handleDeleteRule = (ruleData: ProxyNode) => {
    if (!isProxyRule(ruleData)) return
    proxyStore.deleteRule(ruleData.groupId, ruleData.id)
    ElMessage.success('代理规则已删除')
  }

  // 规则下拉菜单命令处理
  const handleRuleDropdownCommand = (command: string, ruleData: ProxyNode) => {
    if (command === 'duplicate') {
      handleDuplicateRule(ruleData)
    } else if (command === 'edit') {
      handleEditRule(ruleData)
    } else if (command === 'delete') {
      handleDeleteRule(ruleData)
    }
  }

  // 删除分组 - 直接处理
  const handleDeleteGroup = (groupId: string) => {
    proxyStore.deleteGroup(groupId)
    ElMessage.success('分组已删除')
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

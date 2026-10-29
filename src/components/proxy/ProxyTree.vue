<script lang="ts" setup>
  import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
  import type { TreeInstance } from 'element-plus'
  import { useProxyStore } from '../../stores/proxy'
  import type { ProxyGroup, ProxyNode } from '../../types/proxy'
  import { isProxyGroup } from '../../types/proxy'
  import { indexProxyNodes } from './sidebar-projections'
  import ProxyNodeContent from './ProxyNodeContent.vue'
  import { useProxyNodeActions } from './use-proxy-node-actions'

  interface Props {
    groups: ProxyGroup[]
    filterText: string
    activeItemId: string
    favoritesReady: boolean
    persistState?: boolean
  }

  interface Emits {
    (e: 'node-click', data: ProxyNode): void
    (e: 'edit-rule', data: ProxyNode): void
    (e: 'set-favorite', ruleId: string, favorite: boolean): void
    (e: 'set-enabled', ruleId: string, enabled: boolean): void
  }

  const props = withDefaults(defineProps<Props>(), {
    persistState: true
  })
  const emit = defineEmits<Emits>()

  const proxyStore = useProxyStore()
  const treeRef = ref<TreeInstance>()
  const sourceNodes = computed(() => indexProxyNodes(proxyStore.groups))
  // Tree 自己管理展开和选中状态
  const expandedKeys = ref<string[]>([])
  const currentItemId = ref<string>('')
  let uiStateSaveTimer: ReturnType<typeof setTimeout> | null = null

  watch(
    () => props.activeItemId,
    id => {
      currentItemId.value = id
      treeRef.value?.setCurrentKey(id)
    },
    { immediate: true }
  )

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
    if (!props.persistState) return
    if (uiStateSaveTimer) {
      clearTimeout(uiStateSaveTimer)
    }
    uiStateSaveTimer = setTimeout(() => {
      proxyStore.saveUIState({
        expandedKeys: [...expandedKeys.value],
        activeItemId: currentItemId.value
      })
    }, 300)
  }

  // 初始化：加载保存的 UI 状态
  onMounted(async () => {
    if (!props.persistState) {
      expandedKeys.value = collectAllGroupIds(props.groups)
      return
    }
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
      currentItemId.value = props.activeItemId || proxyStore.uiState.activeItemId
      await nextTick()
      treeRef.value?.setCurrentKey(currentItemId.value)
    }
  })

  // 组件卸载前保存状态
  onUnmounted(() => {
    if (uiStateSaveTimer) {
      clearTimeout(uiStateSaveTimer)
    }
    if (props.persistState)
      proxyStore.saveUIState({
        expandedKeys: [...expandedKeys.value],
        activeItemId: currentItemId.value
      })
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
  watch(currentItemId, () => {
    saveUIState()
  })

  // 节点点击 - 更新选中状态并通知父组件
  const handleNodeClick = (data: ProxyNode) => {
    currentItemId.value = data.id
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

  const { handleNodeCommand } = useProxyNodeActions(emit)
</script>

<template>
  <el-tree
    ref="treeRef"
    :data="groups"
    :default-expand-all="!persistState"
    :props="treeProps"
    node-key="id"
    :default-expanded-keys="expandedKeys"
    :current-node-key="currentItemId"
    :expand-on-click-node="false"
    highlight-current
    :filter-node-method="filterNode"
    @node-expand="handleNodeExpand"
    @node-collapse="handleNodeCollapse"
  >
    <template #default="{ data }">
      <ProxyNodeContent
        :data="sourceNodes.get(data.id) || data"
        :active-item-id="currentItemId"
        :favorites-ready="favoritesReady"
        @node-click="handleNodeClick"
        @set-enabled="(id, enabled) => emit('set-enabled', id, enabled)"
        @command="handleNodeCommand"
      />
    </template>
  </el-tree>
</template>

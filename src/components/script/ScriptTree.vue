<script lang="ts" setup>
  import { computed, nextTick, ref, watch } from 'vue'
  import type { TreeInstance } from 'element-plus'
  import type { ScriptGroup, ScriptNode } from '../../types/script'
  import ScriptNodeContent from './ScriptNodeContent.vue'

  const props = withDefaults(
    defineProps<{
      groups: ScriptGroup[]
      sourceGroups: ScriptGroup[]
      filterText: string
      activeItemId: string
      expandedKeys: string[]
      favoritesReady: boolean
      busy: boolean
      searching?: boolean
    }>(),
    { searching: false }
  )
  const emit = defineEmits<{
    (event: 'node-click', node: ScriptNode): void
    (event: 'command', command: string, node: ScriptNode): void
    (event: 'update:expandedKeys', keys: string[]): void
  }>()
  const treeRef = ref<TreeInstance>()
  const treeProps = { children: 'children', label: 'name' }
  const sourceNodes = computed(() => {
    const nodes = new Map<string, ScriptNode>()
    const visit = (node: ScriptNode) => {
      nodes.set(node.id, node)
      if (node.type === 'group') node.children.forEach(visit)
    }
    props.sourceGroups.forEach(visit)
    return nodes
  })

  const filterNode = (query: string, data: Record<string, unknown>) =>
    !query || String(data.name).toLowerCase().includes(query.toLowerCase())

  const updateExpansion = (node: ScriptNode, expanded: boolean) => {
    if (props.filterText.trim() || props.searching) return
    const keys = expanded
      ? [...new Set([...props.expandedKeys, node.id])]
      : props.expandedKeys.filter(id => id !== node.id)
    emit('update:expandedKeys', keys)
  }

  watch(
    () => [props.groups, props.expandedKeys, props.filterText, props.searching, props.activeItemId],
    async () => {
      await nextTick()
      const tree = treeRef.value
      if (!tree) return
      const query = props.filterText.trim()
      tree.filter(query)
      if (!query) {
        const expanded = new Set(props.expandedKeys)
        const restore = (group: ScriptGroup) => {
          const node = tree.getNode(group.id)
          if (node) node.expanded = props.searching || expanded.has(group.id)
          group.children.forEach(child => {
            if (child.type === 'group') restore(child)
          })
        }
        props.groups.forEach(restore)
      }
      tree.setCurrentKey(props.activeItemId, false)
    },
    { immediate: true, flush: 'post' }
  )
</script>

<template>
  <el-tree
    ref="treeRef"
    :data="groups"
    :props="treeProps"
    node-key="id"
    :default-expanded-keys="expandedKeys"
    :auto-expand-parent="false"
    :current-node-key="activeItemId"
    :expand-on-click-node="false"
    highlight-current
    :filter-node-method="filterNode"
    empty-text="暂无脚本分类"
    @node-expand="node => updateExpansion(node, true)"
    @node-collapse="node => updateExpansion(node, false)"
  >
    <template #default="{ data }">
      <ScriptNodeContent
        :data="sourceNodes.get(data.id) || data"
        :active-item-id="activeItemId"
        :favorites-ready="favoritesReady"
        :busy="busy"
        @node-click="node => emit('node-click', node)"
        @command="(command, node) => emit('command', command, node)"
      />
    </template>
  </el-tree>
</template>

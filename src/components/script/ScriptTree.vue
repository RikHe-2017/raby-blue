<script lang="ts" setup>
  import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
  import { ElMessage } from 'element-plus'
  import type { TreeInstance } from 'element-plus'
  import { useScriptStore } from '../../stores/script'
  import type { ScriptGroup, ScriptNode, Script } from '../../types/script'
  import { isScript, isScriptGroup } from '../../types/script'

  interface Props {
    groups: ScriptGroup[]
    filterText: string
  }

  interface Emits {
    (e: 'node-click', data: ScriptNode): void
    (e: 'edit-script', data: ScriptNode): void
  }

  const props = defineProps<Props>()
  const emit = defineEmits<Emits>()

  const scriptStore = useScriptStore()
  const treeRef = ref<TreeInstance>()

  // Tree 自己管理展开和选中状态
  const expandedKeys = ref<string[]>([])
  const activeItemId = ref<string>('')
  let uiStateSaveTimer: ReturnType<typeof setTimeout> | null = null

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

  // 收集所有分组ID
  const collectAllGroupIds = (groups: ScriptGroup[]): string[] => {
    const ids: string[] = []
    groups.forEach(group => {
      ids.push(group.id)
      const childGroups = group.children.filter(isScriptGroup)
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
      scriptStore.saveUIState({
        expandedKeys: [...expandedKeys.value],
        activeItemId: activeItemId.value
      })
    }, 300)
  }

  // 初始化：加载保存的 UI 状态
  onMounted(async () => {
    await scriptStore.loadUIState()
    await nextTick()

    // 恢复展开状态
    const savedExpandedKeys = Array.isArray(scriptStore.uiState.expandedKeys)
      ? [...scriptStore.uiState.expandedKeys]
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
    if (scriptStore.uiState.activeItemId) {
      activeItemId.value = scriptStore.uiState.activeItemId
      await nextTick()
      treeRef.value?.setCurrentKey(activeItemId.value)
    }
  })

  // 组件卸载前保存状态
  onUnmounted(() => {
    if (uiStateSaveTimer) {
      clearTimeout(uiStateSaveTimer)
    }
    scriptStore.saveUIState({
      expandedKeys: [...expandedKeys.value],
      activeItemId: activeItemId.value
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
  watch(activeItemId, () => {
    saveUIState()
  })

  // 节点点击 - 更新选中状态并通知父组件
  const handleNodeClick = (data: ScriptNode) => {
    activeItemId.value = data.id
    // :current-node-key 绑定会自动更新树的选中状态，不需要手动调用 setCurrentKey
    // 通知 Sidebar 更新内容区域状态
    emit('node-click', data)
  }

  // 节点展开 - 更新展开状态
  const handleNodeExpand = (data: ScriptNode) => {
    if (!expandedKeys.value.includes(data.id)) {
      expandedKeys.value.push(data.id)
    }
  }

  // 节点折叠 - 更新展开状态
  const handleNodeCollapse = (data: ScriptNode) => {
    const index = expandedKeys.value.indexOf(data.id)
    if (index > -1) {
      expandedKeys.value.splice(index, 1)
    }
  }

  // 添加分组 - 直接处理
  const handleAddGroup = (parentId?: string) => {
    const newGroup: ScriptGroup = {
      id: crypto.randomUUID(),
      name: '新分类',
      type: 'group',
      children: []
    }
    scriptStore.addGroup(newGroup, parentId)
  }

  // 添加脚本 - 直接处理
  const handleAddScript = (parentId: string) => {
    const newScript: Script = {
      id: crypto.randomUUID(),
      name: '新脚本',
      content: '// 请输入你的JS代码',
      groupId: parentId,
      type: 'script'
    }
    scriptStore.addScript(parentId, newScript)
  }

  // 分组下拉菜单命令处理
  const handleDropdownCommand = (command: string, parentData: ScriptNode) => {
    if (command === 'category') {
      handleAddGroup(parentData.id)
    } else if (command === 'script') {
      handleAddScript(parentData.id)
    }
  }

  // 复制脚本 - 直接处理
  const handleDuplicateScript = (scriptData: ScriptNode) => {
    if (!isScript(scriptData)) return
    const duplicatedScript: Script = {
      id: crypto.randomUUID(),
      name: `${scriptData.name} - 副本`,
      content: isScript(scriptData) ? scriptData.content : '',
      groupId: scriptData.groupId,
      type: 'script'
    }
    scriptStore.addScript(scriptData.groupId, duplicatedScript)
  }

  // 编辑脚本 - 需要通知父组件切换到编辑模式
  const handleEditScript = (scriptData: ScriptNode) => {
    emit('edit-script', scriptData)
  }

  // 删除脚本 - 直接处理
  const handleDeleteScript = (scriptData: ScriptNode) => {
    if (!isScript(scriptData)) return
    scriptStore.deleteScript(scriptData.groupId, scriptData.id)
    ElMessage.success('脚本已删除')
  }

  // 脚本下拉菜单命令处理
  const handleScriptDropdownCommand = (command: string, scriptData: ScriptNode) => {
    if (command === 'duplicate') {
      handleDuplicateScript(scriptData)
    } else if (command === 'edit') {
      handleEditScript(scriptData)
    } else if (command === 'delete') {
      handleDeleteScript(scriptData)
    }
  }

  // 删除分组 - 直接处理
  const handleDeleteGroup = (groupId: string) => {
    scriptStore.deleteGroup(groupId)
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

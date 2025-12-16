<script lang="ts" setup>
  import { onMounted, onUnmounted, ref, watch, computed, nextTick } from 'vue'
  import ScriptSidebar from './ScriptSidebar.vue'
  import ScriptSection from './ScriptSection.vue'
  import { useScriptStore } from '../../stores/script'
  import type { ScriptGroup, Script } from '../../types/script'

  interface TreeNode {
    id: string
    label: string
    type: 'group' | 'script'
    groupId?: string
    children?: TreeNode[]
  }

  const scriptStore = useScriptStore()
  const activeGroupId = ref<string>('')
  const activeItemId = ref<string>('')
  const scriptContent = ref('// 请输入你的JS代码')
  const activeItemName = ref('')
  const isNameSaved = ref(false)
  const isContentSaved = ref(false)
  let nameSaveTimer: ReturnType<typeof setTimeout> | null = null
  let contentSaveTimer: ReturnType<typeof setTimeout> | null = null
  const expandedKeys = ref<string[]>([])
  let uiStateSaveTimer: ReturnType<typeof setTimeout> | null = null

  const groups = computed(() => scriptStore.groups)

  // 递归查找分组
  const findGroupById = (groups: ScriptGroup[], id: string): ScriptGroup | null => {
    for (const group of groups) {
      if (group.id === id) {
        return group
      }
      if (group.children) {
        const found = findGroupById(group.children, id)
        if (found) return found
      }
    }
    return null
  }

  const activeGroup = computed(() => {
    return findGroupById(groups.value, activeGroupId.value)
  })

  // 判断当前选中的是否为分组
  const isActiveGroup = computed(() => {
    return !!(activeGroupId.value && activeItemId.value === activeGroupId.value)
  })

  // 当前选中的脚本
  const activeScript = computed((): Script | null => {
    if (isActiveGroup.value) return null
    const group = activeGroup.value
    if (!group) return null
    return group.scripts.find(script => script.id === activeItemId.value) || null
  })

  // 设置默认选中项
  const setDefaultActiveItem = () => {
    if (groups.value.length > 0) {
      activeGroupId.value = groups.value[0].id
      activeItemId.value = groups.value[0].id
    }
  }

  onMounted(async () => {
    await scriptStore.loadConfig()
    await scriptStore.loadUIState()

    // 确保 expandedKeys 是数组格式
    await nextTick()
    const savedExpandedKeys = Array.isArray(scriptStore.uiState.expandedKeys)
      ? [...scriptStore.uiState.expandedKeys]
      : []

    // 恢复UI状态
    if (savedExpandedKeys.length > 0) {
      const validExpandedKeys: string[] = []
      const collectAllGroupIds = (groups: ScriptGroup[]): string[] => {
        const ids: string[] = []
        groups.forEach(group => {
          ids.push(group.id)
          if (group.children) {
            ids.push(...collectAllGroupIds(group.children))
          }
        })
        return ids
      }
      const allGroupIds = collectAllGroupIds(groups.value)
      savedExpandedKeys.forEach(id => {
        if (allGroupIds.includes(id)) {
          validExpandedKeys.push(id)
        }
      })
      await nextTick()
      expandedKeys.value = validExpandedKeys.length > 0 ? validExpandedKeys : allGroupIds
    } else {
      const allGroupIds: string[] = []
      const collectGroupIds = (groups: ScriptGroup[]) => {
        groups.forEach(group => {
          allGroupIds.push(group.id)
          if (group.children) {
            collectGroupIds(group.children)
          }
        })
      }
      collectGroupIds(groups.value)
      await nextTick()
      expandedKeys.value = allGroupIds
    }

    // 恢复选中状态
    if (scriptStore.uiState.activeGroupId && scriptStore.uiState.activeItemId) {
      const savedGroup = findGroupById(groups.value, scriptStore.uiState.activeGroupId)
      if (savedGroup) {
        if (scriptStore.uiState.activeItemId === scriptStore.uiState.activeGroupId) {
          activeGroupId.value = scriptStore.uiState.activeGroupId
          activeItemId.value = scriptStore.uiState.activeGroupId
        } else {
          const script = savedGroup.scripts.find(s => s.id === scriptStore.uiState.activeItemId)
          if (script) {
            activeGroupId.value = scriptStore.uiState.activeGroupId
            activeItemId.value = scriptStore.uiState.activeItemId
          } else {
            setDefaultActiveItem()
          }
        }
      } else {
        setDefaultActiveItem()
      }
    } else {
      setDefaultActiveItem()
    }

    isInitializing = false
  })

  let isInitializing = true
  watch([activeGroupId, activeItemId], () => {
    if (!isInitializing) {
      saveUIState()
    }
  })

  onUnmounted(() => {
    if (nameSaveTimer) {
      clearTimeout(nameSaveTimer)
    }
    if (contentSaveTimer) {
      clearTimeout(contentSaveTimer)
    }
    if (uiStateSaveTimer) {
      clearTimeout(uiStateSaveTimer)
    }
    scriptStore.uiState.expandedKeys = [...expandedKeys.value]
    scriptStore.uiState.activeGroupId = activeGroupId.value
    scriptStore.uiState.activeItemId = activeItemId.value
    scriptStore.saveUIState()
  })

  // 监听活动项目变化
  watch(
    [activeGroup, activeScript],
    ([group, script]) => {
      if (isActiveGroup.value && group) {
        activeItemName.value = group.name
        scriptContent.value = ''
        isNameSaved.value = true
        isContentSaved.value = true
      } else if (script) {
        activeItemName.value = script.name
        scriptContent.value = script.content || '// 请输入你的JS代码'
        isNameSaved.value = true
        isContentSaved.value = true
      } else {
        activeItemName.value = ''
        scriptContent.value = '// 请输入你的JS代码'
        isNameSaved.value = false
        isContentSaved.value = false
      }
    },
    { immediate: true }
  )

  watch(
    expandedKeys,
    () => {
      if (!isInitializing) {
        saveUIState()
      }
    },
    { deep: true }
  )

  const saveUIState = () => {
    if (uiStateSaveTimer) {
      clearTimeout(uiStateSaveTimer)
    }
    uiStateSaveTimer = setTimeout(() => {
      scriptStore.uiState.expandedKeys = [...expandedKeys.value]
      scriptStore.uiState.activeGroupId = activeGroupId.value
      scriptStore.uiState.activeItemId = activeItemId.value
      scriptStore.saveUIState()
    }, 300)
  }

  const handleNodeClick = (data: TreeNode) => {
    if (data.type === 'group') {
      activeGroupId.value = data.id
      activeItemId.value = data.id
    } else if (data.type === 'script') {
      activeGroupId.value = data.groupId!
      activeItemId.value = data.id
    }
    saveUIState()
  }

  const handleNodeExpand = (data: TreeNode) => {
    if (!expandedKeys.value.includes(data.id)) {
      expandedKeys.value.push(data.id)
    }
    if (!isInitializing) {
      saveUIState()
    }
  }

  const handleNodeCollapse = (data: TreeNode) => {
    const index = expandedKeys.value.indexOf(data.id)
    if (index > -1) {
      expandedKeys.value.splice(index, 1)
    }
    if (!isInitializing) {
      saveUIState()
    }
  }

  const handleAddGroup = () => {
    const newGroup: ScriptGroup = {
      id: crypto.randomUUID(),
      name: '新分类',
      scripts: []
    }
    scriptStore.addGroup(newGroup)
    if (!activeGroupId.value) {
      activeGroupId.value = newGroup.id
    }
  }

  const handleAddScript = () => {
    if (!activeGroupId.value) {
      handleAddGroup()
      return
    }
    handleAddScriptToGroup(activeGroupId.value)
  }

  const handleAddScriptToGroup = (groupId: string) => {
    const newScript: Script = {
      id: crypto.randomUUID(),
      name: '新脚本',
      content: '// 请输入你的JS代码',
      groupId
    }
    scriptStore.addScript(groupId, newScript)
    activeGroupId.value = groupId
    activeItemId.value = newScript.id
  }

  const handleDuplicateScript = (scriptData: TreeNode) => {
    const group = findGroupById(groups.value, scriptData.groupId!)
    if (group) {
      const originalScript = group.scripts.find(s => s.id === scriptData.id)
      if (originalScript) {
        const duplicatedScript: Script = {
          id: crypto.randomUUID(),
          name: `${originalScript.name} - 副本`,
          content: originalScript.content,
          groupId: scriptData.groupId!
        }
        scriptStore.addScript(scriptData.groupId!, duplicatedScript)
      }
    }
  }

  const handleEditScript = (scriptData: TreeNode) => {
    activeGroupId.value = scriptData.groupId!
    activeItemId.value = scriptData.id
  }

  const handleDeleteScript = (scriptData: TreeNode) => {
    scriptStore.deleteScript(scriptData.groupId!, scriptData.id)
    if (activeItemId.value === scriptData.id) {
      activeItemId.value = ''
      activeItemName.value = ''
      scriptContent.value = '// 请输入你的JS代码'
    }
    ElMessage.success('脚本已删除')
  }

  const handleDeleteGroup = (groupId: string) => {
    scriptStore.deleteGroup(groupId)
    if (activeGroupId.value === groupId) {
      activeGroupId.value = groups.value.length > 0 ? groups.value[0].id : ''
    }
  }

  const handleSaveItemName = async () => {
    if (isActiveGroup.value && activeGroupId.value && activeItemName.value.trim()) {
      scriptStore.updateGroup(activeGroupId.value, { name: activeItemName.value.trim() })
      isNameSaved.value = true
    } else if (activeScript.value && activeItemName.value.trim()) {
      scriptStore.updateScript(activeGroupId.value, activeScript.value.id, {
        name: activeItemName.value.trim()
      })
      isNameSaved.value = true
    }
  }

  watch(activeItemName, () => {
    if (!activeGroupId.value) return
    isNameSaved.value = false
    if (nameSaveTimer) {
      clearTimeout(nameSaveTimer)
    }
    nameSaveTimer = setTimeout(() => {
      handleSaveItemName()
    }, 500)
  })

  const handleExportConfig = () => {
    try {
      const exportData = {
        version: '1.0.0',
        exportTime: new Date().toISOString(),
        config: scriptStore.config
      }
      const dataStr = JSON.stringify(exportData, null, 2)
      const dataBlob = new Blob([dataStr], { type: 'application/json' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(dataBlob)
      link.download = `script-config-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(link.href)
      ElMessage.success('配置导出成功')
    } catch (error) {
      console.error('导出配置失败:', error)
      ElMessage.error('导出配置失败')
    }
  }

  const handleImportConfig = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async event => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const importData = JSON.parse(text)
        if (!importData.config || !importData.config.groups) {
          throw new Error('无效的配置文件格式')
        }
        if (confirm('导入配置将覆盖现有配置，是否继续？')) {
          scriptStore.config.enabled = importData.config.enabled
          scriptStore.config.groups = importData.config.groups
          await scriptStore.saveConfig()
          ElMessage.success('配置导入成功')
        }
      } catch (error) {
        console.error('导入配置失败:', error)
        ElMessage.error(`导入配置失败: ${error instanceof Error ? error.message : '未知错误'}`)
      }
    }
    input.click()
  }

  const saveScriptContent = () => {
    if (activeScript.value) {
      scriptStore.updateScript(activeGroupId.value, activeScript.value.id, {
        content: scriptContent.value
      })
      isContentSaved.value = true
    }
  }

  watch(scriptContent, () => {
    if (!activeScript.value) return
    isContentSaved.value = false
    if (contentSaveTimer) {
      clearTimeout(contentSaveTimer)
    }
    contentSaveTimer = setTimeout(() => {
      saveScriptContent()
    }, 800)
  })

  /**
   * 检查是否在浏览器扩展环境中运行
   */
  const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id

  const handleExecuteScript = async () => {
    if (!activeScript.value || !scriptContent.value.trim()) {
      ElMessage.warning('请先选择并编写脚本')
      return
    }

    try {
      if (isExtension) {
        // 在扩展环境中，通过Chrome Extension API执行脚本
        const response = await chrome.runtime.sendMessage({
          action: 'executeScript',
          code: scriptContent.value
        })

        if (response && response.success) {
          ElMessage.success('脚本执行成功')
          if (response.results) {
            console.log('执行结果:', response.results)
          }
        } else {
          ElMessage.error(response?.error || '脚本执行失败')
        }
      } else {
        // 在非扩展环境中（如开发环境），直接在当前页面执行
        // 注意：这仅用于开发调试，生产环境应该在扩展中运行
        try {
          const result = eval(scriptContent.value)
          ElMessage.success('脚本执行成功（开发模式）')
          if (result !== undefined) {
            console.log('执行结果:', result)
          }
        } catch (evalError) {
          ElMessage.error(
            `脚本执行失败: ${evalError instanceof Error ? evalError.message : '未知错误'}`
          )
        }
      }
    } catch (error) {
      console.error('执行脚本失败:', error)
      ElMessage.error(`执行失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }
</script>

<template>
  <div class="script-view">
    <!-- 左侧脚本列表 -->
    <ScriptSidebar
      :groups="groups"
      :expanded-keys="expandedKeys"
      :active-item-id="activeItemId"
      @node-click="handleNodeClick"
      @node-expand="handleNodeExpand"
      @node-collapse="handleNodeCollapse"
      @add-group="handleAddGroup"
      @add-script="handleAddScript"
      @export-config="handleExportConfig"
      @import-config="handleImportConfig"
      @duplicate-script="handleDuplicateScript"
      @edit-script="handleEditScript"
      @delete-script="handleDeleteScript"
      @delete-group="handleDeleteGroup"
    />

    <!-- 右侧内容区域 -->
    <div class="script-view__content">
      <div class="script-view__content-body">
        <ScriptSection
          :active-group-id="activeGroupId"
          :is-active-group="isActiveGroup"
          :active-script="activeScript"
          :active-item-name="activeItemName"
          :script-content="scriptContent"
          :is-name-saved="isNameSaved"
          :is-content-saved="isContentSaved"
          @update:active-item-name="val => (activeItemName = val)"
          @update:script-content="val => (scriptContent = val)"
          @script-input="() => {}"
          @format-script="() => {}"
          @execute-script="handleExecuteScript"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .script-view {
    display: flex;
    width: 100%;
    height: 100%;
  }

  .script-view__content {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--el-bg-color-page);
  }

  .script-view__content-body {
    flex: 1;
    padding: 8px;
    overflow-y: auto;
  }
</style>

<script lang="ts" setup>
  import { onMounted, onBeforeUnmount, ref, watch, computed } from 'vue'
  import ScriptSidebar from './ScriptSidebar.vue'
  import ScriptSection from './ScriptSection.vue'
  import { useScriptStore } from '../../stores/script'
  import type { ScriptGroup, Script, ScriptNode } from '../../types/script'
  import { isScriptGroup, isScript } from '../../types/script'
  import { logError, logInfo } from '../../utils/logger'

  const scriptStore = useScriptStore()
  const configLoaded = ref(false)
  // 内容区域的状态（不需要持久化）
  const activeGroupId = ref<string>('')
  const activeItemId = ref<string>('')
  const scriptContent = ref('// 请输入你的JS代码')
  const activeItemName = ref('')
  const isNameSaved = ref(false)
  const isContentSaved = ref(false)
  let nameSaveTimer: ReturnType<typeof setTimeout> | null = null
  let contentSaveTimer: ReturnType<typeof setTimeout> | null = null

  const groups = computed(() => scriptStore.groups)

  // 递归查找分组
  const findGroupById = (groups: ScriptGroup[], id: string): ScriptGroup | null => {
    for (const group of groups) {
      if (group.id === id) {
        return group
      }
      const childGroups = group.children.filter(isScriptGroup)
      if (childGroups.length > 0) {
        const found = findGroupById(childGroups, id)
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
    return (
      group.children.find(
        (node): node is Script => isScript(node) && node.id === activeItemId.value
      ) || null
    )
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

    // 恢复内容区域的选中状态（从 Tree 保存的状态中恢复）
    await scriptStore.loadUIState()
    if (scriptStore.uiState.activeGroupId && scriptStore.uiState.activeItemId) {
      const savedGroup = findGroupById(groups.value, scriptStore.uiState.activeGroupId)
      if (savedGroup) {
        if (scriptStore.uiState.activeItemId === scriptStore.uiState.activeGroupId) {
          activeGroupId.value = scriptStore.uiState.activeGroupId
          activeItemId.value = scriptStore.uiState.activeGroupId
        } else {
          const script = savedGroup.children.find(
            (node): node is Script => isScript(node) && node.id === scriptStore.uiState.activeItemId
          )
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
    configLoaded.value = true
  })

  onBeforeUnmount(() => {
    void flushPendingChanges().catch(() => ElMessage.error('脚本保存失败，请重试'))
  })

  // 监听活动项目变化
  // 只在切换项目时更新名称，避免在用户输入时重置
  watch(
    [activeGroupId, activeItemId],
    ([newGroupId, newItemId], [oldGroupId, oldItemId]) => {
      // 只在切换项目时更新名称和内容
      const groupChanged = newGroupId !== oldGroupId
      const itemChanged = newItemId !== oldItemId

      if (groupChanged || itemChanged) {
        if (isActiveGroup.value && activeGroup.value) {
          activeItemName.value = activeGroup.value.name
          scriptContent.value = ''
          isNameSaved.value = true
          isContentSaved.value = true
        } else if (activeScript.value) {
          activeItemName.value = activeScript.value.name
          scriptContent.value = activeScript.value.content || '// 请输入你的JS代码'
          isNameSaved.value = true
          isContentSaved.value = true
        } else {
          activeItemName.value = ''
          scriptContent.value = '// 请输入你的JS代码'
          isNameSaved.value = false
          isContentSaved.value = false
        }
      }
    },
    { immediate: true }
  )

  // 监听内容区域状态变化，保存到 store（用于内容区域恢复）
  watch([activeGroupId, activeItemId], () => {
    scriptStore.saveUIState({
      activeGroupId: activeGroupId.value,
      activeItemId: activeItemId.value
    })
  })

  let selectionRevision = 0

  const handleSelectNode = async (node: ScriptNode) => {
    const revision = ++selectionRevision
    try {
      await flushPendingChanges()
      if (revision !== selectionRevision) return
      activeGroupId.value = node.type === 'group' ? node.id : node.groupId
      activeItemId.value = node.id
    } catch {
      ElMessage.error('脚本保存失败，请重试')
    }
  }

  const handleEditScript = (scriptData: ScriptNode) => {
    if (isScript(scriptData)) void handleSelectNode(scriptData)
  }

  // 监听 groups 变化，处理删除后的 UI 状态清理
  watch(
    groups,
    () => {
      // 检查当前选中的脚本是否还存在
      if (
        activeScript.value === null &&
        activeItemId.value &&
        activeItemId.value !== activeGroupId.value
      ) {
        // 脚本被删除了，清空选中状态
        activeItemId.value = ''
        activeItemName.value = ''
        scriptContent.value = '// 请输入你的JS代码'
      }
      // 检查当前选中的分组是否还存在
      if (activeGroup.value === null && activeGroupId.value) {
        // 分组被删除了，切换到第一个分组或清空
        activeGroupId.value = groups.value.length > 0 ? groups.value[0].id : ''
        activeItemId.value = activeGroupId.value || ''
      }
    },
    { deep: true }
  )

  const handleSaveItemName = async () => {
    const groupId = activeGroupId.value
    const itemId = activeItemId.value
    const name = activeItemName.value.trim()
    if (!name) return
    if (isActiveGroup.value && groupId) {
      await scriptStore.updateGroup(groupId, { name })
    } else if (activeScript.value) {
      await scriptStore.updateScript(groupId, itemId, { name })
    }
    if (activeItemId.value === itemId && activeItemName.value.trim() === name) {
      isNameSaved.value = true
    }
  }

  watch(activeItemName, () => {
    if (!activeGroupId.value) return
    const savedName = isActiveGroup.value ? activeGroup.value?.name : activeScript.value?.name
    if (activeItemName.value === savedName) return
    isNameSaved.value = false
    if (nameSaveTimer) {
      clearTimeout(nameSaveTimer)
    }
    nameSaveTimer = setTimeout(() => {
      nameSaveTimer = null
      void handleSaveItemName().catch(() => ElMessage.error('名称保存失败，请重试'))
    }, 500)
  })

  const saveScriptContent = async () => {
    const script = activeScript.value
    const content = scriptContent.value
    if (script) {
      await scriptStore.updateScript(script.groupId, script.id, { content })
    }
    if (activeScript.value?.id === script?.id && scriptContent.value === content) {
      isContentSaved.value = true
    }
  }

  watch(scriptContent, () => {
    if (!activeScript.value) return
    if (scriptContent.value === activeScript.value.content) return
    isContentSaved.value = false
    if (contentSaveTimer) {
      clearTimeout(contentSaveTimer)
    }
    contentSaveTimer = setTimeout(() => {
      contentSaveTimer = null
      void saveScriptContent().catch(() => ElMessage.error('脚本内容保存失败，请重试'))
    }, 800)
  })

  const flushPendingChanges = async () => {
    const saveName = !!nameSaveTimer || !isNameSaved.value
    const saveContent = !!contentSaveTimer || !isContentSaved.value
    if (nameSaveTimer) {
      clearTimeout(nameSaveTimer)
      nameSaveTimer = null
    }
    if (contentSaveTimer) {
      clearTimeout(contentSaveTimer)
      contentSaveTimer = null
    }
    const nameSaving = saveName ? handleSaveItemName() : Promise.resolve()
    const contentSaving = saveContent ? saveScriptContent() : Promise.resolve()
    await Promise.all([nameSaving, contentSaving])
    await scriptStore.saveConfig()
  }

  defineExpose({ flushPendingChanges })

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
          code: scriptContent.value,
          scriptId: activeScript.value.id,
          scriptName: activeScript.value.name
        })

        if (response && response.success) {
          ElMessage.success('脚本执行成功')
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
            logInfo('脚本执行完成')
          }
        } catch (evalError) {
          ElMessage.error(
            `脚本执行失败: ${evalError instanceof Error ? evalError.message : '未知错误'}`
          )
        }
      }
    } catch (error) {
      logError('执行脚本失败:', error)
      ElMessage.error(`执行失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }
</script>

<template>
  <div class="script-view">
    <!-- 左侧脚本列表 -->
    <ScriptSidebar
      v-if="configLoaded"
      :groups="groups"
      :active-item-id="activeItemId"
      :before-command="flushPendingChanges"
      @select="handleSelectNode"
      @edit-script="handleEditScript"
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

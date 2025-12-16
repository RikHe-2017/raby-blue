import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ScriptConfig, ScriptGroup, Script } from '../types/script'
import { DEFAULT_SCRIPT_CONFIG } from '../types/script'
import { createStorageAdapter } from './storage'

const storage = createStorageAdapter()

export const useScriptStore = defineStore('script', () => {
  const config = ref<ScriptConfig>(DEFAULT_SCRIPT_CONFIG)

  const enabled = computed(() => config.value.enabled)
  const groups = computed(() => config.value.groups)

  const toggleGlobalScript = () => {
    config.value.enabled = !config.value.enabled
    saveConfig()
  }

  /**
   * 递归查找分组
   */
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

  const addGroup = (group: ScriptGroup, parentId?: string) => {
    if (parentId) {
      // 添加子分组
      const parentGroup = findGroupById(config.value.groups, parentId)
      if (parentGroup) {
        if (!parentGroup.children) {
          parentGroup.children = []
        }
        group.parentId = parentId
        parentGroup.children.push(group)
      }
    } else {
      // 添加顶级分组
      config.value.groups.push(group)
    }
    saveConfig()
  }

  const updateGroup = (groupId: string, updatedGroup: Partial<ScriptGroup>) => {
    const group = findGroupById(config.value.groups, groupId)
    if (group) {
      Object.assign(group, updatedGroup)
      saveConfig()
    }
  }

  const deleteGroup = (groupId: string) => {
    // 递归删除分组
    const deleteGroupRecursive = (groups: ScriptGroup[]): ScriptGroup[] => {
      return groups.filter(group => {
        if (group.id === groupId) {
          return false // 删除当前分组
        }
        if (group.children) {
          group.children = deleteGroupRecursive(group.children)
        }
        return true
      })
    }

    config.value.groups = deleteGroupRecursive(config.value.groups)
    saveConfig()
  }

  const addScript = (groupId: string, script: Script) => {
    const group = findGroupById(config.value.groups, groupId)
    if (group) {
      script.createdAt = new Date().toISOString()
      script.updatedAt = new Date().toISOString()
      group.scripts.push(script)
      saveConfig()
    }
  }

  const updateScript = (groupId: string, scriptId: string, updatedScript: Partial<Script>) => {
    const group = findGroupById(config.value.groups, groupId)
    if (group) {
      const index = group.scripts.findIndex(s => s.id === scriptId)
      if (index !== -1) {
        group.scripts[index] = {
          ...group.scripts[index],
          ...updatedScript,
          updatedAt: new Date().toISOString()
        }
        saveConfig()
      }
    }
  }

  const deleteScript = (groupId: string, scriptId: string) => {
    const group = findGroupById(config.value.groups, groupId)
    if (group) {
      group.scripts = group.scripts.filter(s => s.id !== scriptId)
      saveConfig()
    }
  }

  const saveConfig = async () => {
    await storage.set('scriptConfig', config.value)
  }

  const loadConfig = async () => {
    const result = await storage.get('scriptConfig')
    if (result) {
      config.value = result
    }
  }

  // UI状态：展开的节点ID列表和选中的节点ID
  const uiState = ref<{
    expandedKeys: string[]
    activeGroupId: string
    activeItemId: string
  }>({
    expandedKeys: [],
    activeGroupId: '',
    activeItemId: ''
  })

  const saveUIState = async () => {
    // 确保 expandedKeys 是数组格式
    const stateToSave = {
      ...uiState.value,
      expandedKeys: Array.isArray(uiState.value.expandedKeys) ? uiState.value.expandedKeys : []
    }
    await storage.set('scriptUIState', stateToSave)
  }

  const loadUIState = async () => {
    const result = await storage.get('scriptUIState')
    if (result) {
      // 确保 expandedKeys 是数组格式（Chrome storage 可能将数组转换为对象）
      if (result.expandedKeys) {
        if (Array.isArray(result.expandedKeys)) {
          uiState.value = result
        } else if (typeof result.expandedKeys === 'object') {
          // 如果是对象，转换为数组
          uiState.value = {
            ...result,
            expandedKeys: Object.values(result.expandedKeys)
          }
        } else {
          uiState.value = result
        }
      } else {
        uiState.value = result
      }
    }
  }

  return {
    config,
    enabled,
    groups,
    uiState,
    toggleGlobalScript,
    addGroup,
    updateGroup,
    deleteGroup,
    addScript,
    updateScript,
    deleteScript,
    saveConfig,
    loadConfig,
    saveUIState,
    loadUIState
  }
})

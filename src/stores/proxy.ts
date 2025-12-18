import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ProxyConfig, ProxyGroup, ProxyRule } from '../types/proxy'
import { DEFAULT_PROXY_CONFIG, isProxyGroup, isProxyRule } from '../types/proxy'
import { createStorageAdapter } from './storage'

const storage = createStorageAdapter()

export const useProxyStore = defineStore('proxy', () => {
  const config = ref<ProxyConfig>(DEFAULT_PROXY_CONFIG)

  const enabled = computed(() => config.value.enabled)
  const groups = computed(() => config.value.groups)

  const toggleGlobalProxy = () => {
    config.value.enabled = !config.value.enabled
    saveConfig()
  }

  /**
   * 递归查找分组
   */
  const findGroupById = (groups: ProxyGroup[], id: string): ProxyGroup | null => {
    for (const group of groups) {
      if (group.id === id) {
        return group
      }
      // 从 children 中过滤出 ProxyGroup 类型，递归查找
      const childGroups = group.children.filter(isProxyGroup)
      if (childGroups.length > 0) {
        const found = findGroupById(childGroups, id)
        if (found) return found
      }
    }
    return null
  }

  const addGroup = (group: ProxyGroup, parentId?: string) => {
    if (parentId) {
      // 添加子分组
      const parentGroup = findGroupById(config.value.groups, parentId)
      if (parentGroup) {
        group.parentId = parentId
        parentGroup.children.push(group)
      }
    } else {
      // 添加顶级分组
      config.value.groups.push(group)
    }
    saveConfig()
  }

  const updateGroup = (groupId: string, updatedGroup: Partial<ProxyGroup>) => {
    const group = findGroupById(config.value.groups, groupId)
    if (group) {
      Object.assign(group, updatedGroup)
      saveConfig()
    }
  }

  const deleteGroup = (groupId: string) => {
    // 递归删除分组
    const deleteGroupRecursive = (groups: ProxyGroup[]): ProxyGroup[] => {
      return groups.filter(group => {
        if (group.id === groupId) {
          return false // 删除当前分组
        }
        // 从 children 中过滤出 ProxyGroup，递归删除
        const childGroups = group.children.filter(isProxyGroup)
        if (childGroups.length > 0) {
          const filteredGroups = deleteGroupRecursive(childGroups)
          // 保留规则，只更新分组
          const rules = group.children.filter(isProxyRule)
          group.children = [...filteredGroups, ...rules]
        }
        return true
      })
    }

    config.value.groups = deleteGroupRecursive(config.value.groups)
    saveConfig()
  }

  const addRule = (groupId: string, rule: ProxyRule) => {
    const group = findGroupById(config.value.groups, groupId)
    if (group) {
      group.children.push(rule)
      saveConfig()
    }
  }

  const updateRule = (groupId: string, ruleId: string, updatedRule: Partial<ProxyRule>) => {
    const group = findGroupById(config.value.groups, groupId)
    if (group) {
      const index = group.children.findIndex(node => isProxyRule(node) && node.id === ruleId)
      if (index !== -1 && isProxyRule(group.children[index])) {
        group.children[index] = {
          ...group.children[index],
          ...updatedRule
        } as ProxyRule
        saveConfig()
      }
    }
  }

  const deleteRule = (groupId: string, ruleId: string) => {
    const group = findGroupById(config.value.groups, groupId)
    if (group) {
      group.children = group.children.filter(node => !(isProxyRule(node) && node.id === ruleId))
      saveConfig()
    }
  }

  const saveConfig = async () => {
    await storage.set('proxyConfig', config.value)
  }

  const loadConfig = async () => {
    const result = await storage.get('proxyConfig')
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
    await storage.set('proxyUIState', stateToSave)
  }

  const loadUIState = async () => {
    const result = await storage.get('proxyUIState')
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
    toggleGlobalProxy,
    addGroup,
    updateGroup,
    deleteGroup,
    addRule,
    updateRule,
    deleteRule,
    saveConfig,
    loadConfig,
    saveUIState,
    loadUIState
  }
})

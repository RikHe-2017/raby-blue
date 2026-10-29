import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ProxyConfig, ProxyGroup, ProxyRule } from '../types/proxy'
import { DEFAULT_PROXY_CONFIG, isProxyGroup, isProxyRule } from '../types/proxy'
import { createStorageAdapter } from './storage'
import { updateProxyRule } from './proxy-rules'
import type { ProxyRuleChanges } from './proxy-rules'
import { useUserPreferencesStore } from './user-preferences'
import type { TreeUIState } from './user-preferences-model'

const storage = createStorageAdapter()

export const useProxyStore = defineStore('proxy', () => {
  const config = ref<ProxyConfig>(DEFAULT_PROXY_CONFIG)
  const userPreferences = useUserPreferencesStore()

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

  const updateRule = (ruleId: string, changes: ProxyRuleChanges) => {
    const groups = updateProxyRule(config.value.groups, ruleId, changes)
    if (groups === config.value.groups) return
    config.value = { ...config.value, groups }
    saveConfig()
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

  const uiState = computed(() => userPreferences.preferences.proxyUIState)

  const saveUIState = (patch: Partial<TreeUIState>) =>
    userPreferences.update({ proxyUIState: patch })

  const loadUIState = () => userPreferences.load()

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

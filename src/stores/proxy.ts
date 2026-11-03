import { defineStore } from 'pinia'
import { ref, computed, onScopeDispose } from 'vue'
import type { ProxyConfig, ProxyGroup, ProxyRule } from '../types/proxy'
import { DEFAULT_PROXY_CONFIG, isProxyGroup, isProxyRule } from '../types/proxy'
import { createStorageAdapter } from './storage'
import { setProxyNodeFavorite, updateProxyRule } from './proxy-rules'
import type { ProxyRuleChanges } from './proxy-rules'
import { useUserPreferencesStore } from './user-preferences'
import type { TreeUIState } from './user-preferences-model'

const storage = createStorageAdapter()

export const useProxyStore = defineStore('proxy', () => {
  const config = ref<ProxyConfig>(DEFAULT_PROXY_CONFIG)
  const userPreferences = useUserPreferencesStore()
  let saveQueue: Promise<void> = Promise.resolve()
  const isExtension = typeof chrome !== 'undefined' && !!chrome.runtime?.id

  if (isExtension) {
    const syncGlobalSwitch = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      const enabled = changes.proxyConfig?.newValue?.enabled
      if (area === 'local' && typeof enabled === 'boolean' && enabled !== config.value.enabled)
        config.value = { ...config.value, enabled }
    }
    chrome.storage.onChanged.addListener(syncGlobalSwitch)
    onScopeDispose(() => chrome.storage.onChanged.removeListener(syncGlobalSwitch))
  }

  const enabled = computed(() => config.value.enabled)
  const groups = computed(() => config.value.groups)

  const toggleGlobalProxy = async () => {
    config.value = { ...config.value, enabled: !config.value.enabled }
    try {
      await saveConfig(true)
    } catch (error) {
      const persisted = (await storage.get('proxyConfig').catch(() => undefined)) as
        ProxyConfig | undefined
      if (persisted) config.value = { ...config.value, enabled: persisted.enabled }
      throw error
    }
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

  const updateRule = async (ruleId: string, changes: ProxyRuleChanges) => {
    const groups = updateProxyRule(config.value.groups, ruleId, changes)
    if (groups === config.value.groups) return
    const previous = config.value
    config.value = { ...config.value, groups }
    const applied = config.value
    try {
      await saveConfig()
    } catch (error) {
      if (config.value === applied) config.value = previous
      throw error
    }
  }

  const setFavorite = async (nodeId: string, favorite: boolean) => {
    const groups = setProxyNodeFavorite(config.value.groups, nodeId, favorite)
    if (groups === config.value.groups) return false
    const previous = config.value
    config.value = { ...config.value, groups }
    const applied = config.value
    try {
      await saveConfig()
      return true
    } catch (error) {
      if (config.value === applied) config.value = previous
      throw error
    }
  }

  const deleteRule = (groupId: string, ruleId: string) => {
    const group = findGroupById(config.value.groups, groupId)
    if (group) {
      group.children = group.children.filter(node => !(isProxyRule(node) && node.id === ruleId))
      saveConfig()
    }
  }

  const saveConfig = async (updateEnabled = false) => {
    const snapshot = JSON.parse(JSON.stringify(config.value)) as ProxyConfig
    const operation = saveQueue
      .catch(() => {})
      .then(async () => {
        if (!isExtension) return storage.set('proxyConfig', snapshot)
        const result = (await chrome.runtime.sendMessage({
          action: 'saveProxyConfig',
          config: snapshot,
          updateEnabled
        })) as { success?: boolean; error?: string } | undefined
        if (!result?.success) throw new Error(result?.error ?? '保存代理配置失败')
      })
    saveQueue = operation
    await operation
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
    setFavorite,
    deleteRule,
    saveConfig,
    loadConfig,
    saveUIState,
    loadUIState
  }
})

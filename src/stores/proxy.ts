import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ProxyConfig, ProxyGroup, ProxyRule } from '../types/proxy'
import { DEFAULT_PROXY_CONFIG } from '../types/proxy'

// 检查是否在浏览器扩展环境中运行
const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id

// IndexedDB 存储实现
class IndexedDBStorage {
  private dbName = 'browser-proxy'
  private storeName = 'proxy-config'
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName)
        }
      }
    })
  }

  async get(key: string): Promise<any> {
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.get(key)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const result = request.result
        resolve(result ? JSON.parse(result) : null)
      }
    })
  }

  async set(key: string, value: any): Promise<void> {
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readwrite')
      const store = transaction.objectStore(this.storeName)
      // 将数据序列化为字符串
      const serializedValue = JSON.stringify(value)
      const request = store.put(serializedValue, key)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
}

// 递归转换分组数据：将对象结构转换为数组结构
const convertGroupToArray = (group: any): any => {
  const convertedGroup = { ...group }

  // 转换 rules
  if (group.rules && typeof group.rules === 'object' && !Array.isArray(group.rules)) {
    convertedGroup.rules = Object.values(group.rules)
  }

  // 递归转换 children
  if (group.children && typeof group.children === 'object' && !Array.isArray(group.children)) {
    convertedGroup.children = Object.values(group.children).map(convertGroupToArray)
  }

  return convertedGroup
}

// 数据转换函数：将对象结构转换为数组结构
const convertChromeStorageToArray = (data: any): any => {
  if (!data) return data

  // 如果是配置数据，需要转换 groups 和 rules
  if (data.groups && typeof data.groups === 'object' && !Array.isArray(data.groups)) {
    const convertedData = { ...data }
    convertedData.groups = Object.values(data.groups).map(convertGroupToArray)
    return convertedData
  }

  return data
}

// 递归转换分组数据：将数组结构转换为对象结构
const convertGroupToObject = (group: any): any => {
  const convertedGroup = { ...group }

  // 转换 rules
  if (group.rules && Array.isArray(group.rules)) {
    convertedGroup.rules = group.rules.reduce((ruleAcc: any, rule: any, ruleIndex: number) => {
      ruleAcc[ruleIndex] = rule
      return ruleAcc
    }, {})
  }

  // 递归转换 children
  if (group.children && Array.isArray(group.children)) {
    convertedGroup.children = group.children.reduce(
      (childAcc: any, child: any, childIndex: number) => {
        childAcc[childIndex] = convertGroupToObject(child)
        return childAcc
      },
      {}
    )
  }

  return convertedGroup
}

// 数据转换函数：将数组结构转换为对象结构（用于 Chrome 存储）
const convertArrayToChromeStorage = (data: any): any => {
  if (!data) return data

  // 如果是配置数据，需要转换 groups 和 rules
  if (data.groups && Array.isArray(data.groups)) {
    const convertedData = { ...data }
    convertedData.groups = data.groups.reduce((acc: any, group: any, index: number) => {
      acc[index] = convertGroupToObject(group)
      return acc
    }, {})
    return convertedData
  }

  return data
}

const storage = isExtension
  ? {
      get: async (key: string) => {
        const result = await chrome.storage.sync.get(key)
        const data = result[key]
        return convertChromeStorageToArray(data)
      },
      set: async (key: string, value: any) => {
        const convertedValue = convertArrayToChromeStorage(value)
        await chrome.storage.sync.set({ [key]: convertedValue })
      }
    }
  : new IndexedDBStorage()

export const useProxyStore = defineStore('proxy', () => {
  const config = ref<ProxyConfig>(DEFAULT_PROXY_CONFIG)

  const enabled = computed(() => config.value.enabled)
  const groups = computed(() => config.value.groups)

  const toggleGlobalProxy = () => {
    config.value.enabled = !config.value.enabled
    saveConfig()
  }

  const addGroup = (group: ProxyGroup, parentId?: string) => {
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

  // 递归查找分组
  const findGroupById = (groups: ProxyGroup[], id: string): ProxyGroup | null => {
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
        if (group.children) {
          group.children = deleteGroupRecursive(group.children)
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
      group.rules.push(rule)
      saveConfig()
    }
  }

  const updateRule = (groupId: string, ruleId: string, updatedRule: Partial<ProxyRule>) => {
    const group = findGroupById(config.value.groups, groupId)
    if (group) {
      const index = group.rules.findIndex(r => r.id === ruleId)
      if (index !== -1) {
        group.rules[index] = { ...group.rules[index], ...updatedRule }
        saveConfig()
      }
    }
  }

  const deleteRule = (groupId: string, ruleId: string) => {
    const group = findGroupById(config.value.groups, groupId)
    if (group) {
      group.rules = group.rules.filter(r => r.id !== ruleId)
      saveConfig()
    }
  }

  const saveConfig = async () => {
    try {
      await storage.set('proxyConfig', config.value)
    } catch (error) {
      console.error('Failed to save proxy configuration:', error)
    }
  }

  const loadConfig = async () => {
    try {
      const result = await storage.get('proxyConfig')
      if (result) {
        config.value = result
      }
    } catch (error) {
      console.error('Failed to load proxy configuration:', error)
    }
  }

  return {
    config,
    enabled,
    groups,
    toggleGlobalProxy,
    addGroup,
    updateGroup,
    deleteGroup,
    addRule,
    updateRule,
    deleteRule,
    saveConfig,
    loadConfig
  }
})

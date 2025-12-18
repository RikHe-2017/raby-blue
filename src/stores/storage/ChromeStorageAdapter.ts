import { StorageAdapter } from './StorageAdapter'
import type { ProxyGroup } from '../../types/proxy'

/**
 * Chrome Storage 适配器
 * 用于浏览器扩展环境，需要处理 Chrome Storage 的数组/对象转换问题
 */
export class ChromeStorageAdapter extends StorageAdapter {
  /**
   * 递归转换分组数据：将对象结构转换为数组结构
   */
  private convertGroupToArray(group: any): any {
    const convertedGroup = { ...group }

    // 转换 rules
    if (group.rules && typeof group.rules === 'object' && !Array.isArray(group.rules)) {
      convertedGroup.rules = Object.values(group.rules)
    }

    // 递归转换 children
    if (group.children && typeof group.children === 'object' && !Array.isArray(group.children)) {
      convertedGroup.children = Object.values(group.children).map((child: any) =>
        this.convertGroupToArray(child)
      )
    }

    return convertedGroup
  }

  /**
   * 数据转换函数：将对象结构转换为数组结构
   */
  private convertChromeStorageToArray(data: any): any {
    if (!data) return data

    // 如果是配置数据，需要转换 groups 和 rules
    if (data.groups && typeof data.groups === 'object' && !Array.isArray(data.groups)) {
      const convertedData = { ...data }
      convertedData.groups = Object.values(data.groups).map((group: any) =>
        this.convertGroupToArray(group)
      )
      return convertedData
    }

    return data
  }

  /**
   * 递归转换分组数据：将数组结构转换为对象结构
   */
  private convertGroupToObject(group: ProxyGroup): any {
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
        (childAcc: any, child: ProxyGroup, childIndex: number) => {
          childAcc[childIndex] = this.convertGroupToObject(child)
          return childAcc
        },
        {}
      )
    }

    return convertedGroup
  }

  /**
   * 数据转换函数：将数组结构转换为对象结构（用于 Chrome 存储）
   */
  private convertArrayToChromeStorage(data: any): any {
    if (!data) return data

    // 如果是配置数据，需要转换 groups 和 rules
    if (data.groups && Array.isArray(data.groups)) {
      const convertedData = { ...data }
      convertedData.groups = data.groups.reduce((acc: any, group: ProxyGroup, index: number) => {
        acc[index] = this.convertGroupToObject(group)
        return acc
      }, {})
      return convertedData
    }

    return data
  }

  async get(key: string): Promise<any> {
    const result = await chrome.storage.sync.get(key)
    const data = result[key]
    return this.convertChromeStorageToArray(data)
  }

  async set(key: string, value: any): Promise<void> {
    const convertedValue = this.convertArrayToChromeStorage(value)
    await chrome.storage.sync.set({ [key]: convertedValue })
  }
}

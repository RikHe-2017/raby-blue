import { StorageAdapter } from './StorageAdapter'
import type { ProxyGroup, ProxyNode } from '../../types/proxy'
import { isProxyGroup } from '../../types/proxy'

/**
 * Chrome Storage 适配器
 * 用于浏览器扩展环境，需要处理 Chrome Storage 的数组/对象转换问题
 * 使用 chrome.storage.local 而不是 sync，因为：
 * 1. local 存储限制更大（约 10MB），而 sync 每个项目限制约 8KB
 * 2. 代理配置通常不需要跨设备同步
 */
export class ChromeStorageAdapter extends StorageAdapter {
  /**
   * 递归转换分组数据：将对象结构转换为数组结构
   */
  private convertGroupToArray(group: Record<string, unknown>): ProxyGroup {
    // 构建 ProxyGroup 对象，确保所有必需字段都存在
    const convertedGroup: ProxyGroup = {
      id: group.id as string,
      name: group.name as string,
      enabled: group.enabled as boolean,
      type: 'group' as const,
      children: []
    }

    if (group.parentId) {
      convertedGroup.parentId = group.parentId as string
    }

    // 转换 children（Chrome Storage 可能将数组存储为对象）
    if (group.children && typeof group.children === 'object' && !Array.isArray(group.children)) {
      convertedGroup.children = Object.values(group.children).map((child: unknown) => {
        const childObj = child as Record<string, unknown>
        // 如果是分组（有 children 字段或 type === 'group'），递归转换
        if (childObj.type === 'group' || childObj.children !== undefined) {
          return this.convertGroupToArray(childObj)
        }
        // 否则是规则，直接返回
        return child as ProxyNode
      })
    } else if (Array.isArray(group.children)) {
      // 如果已经是数组，直接使用（但需要确保类型正确）
      convertedGroup.children = group.children as ProxyNode[]
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
   * 递归转换分组数据：将数组结构转换为对象结构（用于 Chrome Storage）
   */
  private convertGroupToObject(group: ProxyGroup): Record<string, unknown> {
    const convertedGroup: Record<string, unknown> = {
      id: group.id,
      name: group.name,
      enabled: group.enabled,
      type: group.type
    }

    if (group.parentId) {
      convertedGroup.parentId = group.parentId
    }

    // 转换 children（统一包含子分组和规则）
    if (group.children && Array.isArray(group.children)) {
      convertedGroup.children = group.children.reduce(
        (childAcc: Record<string, unknown>, child: ProxyNode, childIndex: number) => {
          // 如果是分组，递归转换
          if (isProxyGroup(child)) {
            childAcc[childIndex] = this.convertGroupToObject(child)
          } else {
            // 如果是规则，直接添加
            childAcc[childIndex] = child
          }
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
    const result = await chrome.storage.local.get(key)
    const data = result[key]
    return this.convertChromeStorageToArray(data)
  }

  async set(key: string, value: any): Promise<void> {
    await this.setMany({ [key]: value })
  }

  async setMany(values: Record<string, unknown>): Promise<void> {
    const convertedValues = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, this.convertArrayToChromeStorage(value)])
    )
    await chrome.storage.local.set(convertedValues)
  }
}

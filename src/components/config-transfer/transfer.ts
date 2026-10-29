import type { ProxyConfig, ProxyGroup, ProxyNode } from '../../types/proxy'
import type { ScriptConfig, ScriptGroup, ScriptNode } from '../../types/script'

export type ExportScope = 'proxy' | 'script' | 'all'
export type ImportMode = 'merge' | 'replace'

export interface ConfigData {
  proxyConfig?: ProxyConfig
  scriptConfig?: ScriptConfig
}

export interface Backup extends ConfigData {
  version: '1.0.0'
  exportTime?: string
}

type ConfigKind = 'proxy' | 'script'
type Node = ProxyNode | ScriptNode
type Group = ProxyGroup | ScriptGroup

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

/**
 * 在文件边界校验整棵树；父子引用与 ID 必须有效，不能把非法数据写入业务存储。
 */
function validateConfig(value: unknown, kind: ConfigKind): void {
  if (!isRecord(value) || typeof value.enabled !== 'boolean' || !Array.isArray(value.groups)) {
    throw new Error('配置必须包含 enabled 开关和 groups 数组')
  }

  const ids = new Set<string>()
  const validateNode = (node: unknown, parentId: string | undefined, depth: number) => {
    if (depth > 100) throw new Error('配置分组嵌套过深')
    if (!isRecord(node) || !isNonEmptyString(node.id) || !isNonEmptyString(node.name)) {
      throw new Error('每个分组和配置都必须有有效的 ID 和名称')
    }
    if (ids.has(node.id)) throw new Error(`配置包含重复 ID：${node.id}`)
    ids.add(node.id)

    if (node.type === 'group') {
      if (!Array.isArray(node.children)) throw new Error(`分组“${node.name}”缺少 children 数组`)
      if (kind === 'proxy' && typeof node.enabled !== 'boolean') {
        throw new Error(`代理分组“${node.name}”缺少 enabled 开关`)
      }
      if (node.parentId !== undefined && node.parentId !== parentId) {
        throw new Error(`分组“${node.name}”的父分组引用不正确`)
      }
      node.children.forEach(child => validateNode(child, node.id as string, depth + 1))
      return
    }

    if (!parentId || node.groupId !== parentId) {
      throw new Error(`配置“${node.name}”的所属分组引用不正确`)
    }
    if (kind === 'proxy') {
      if (node.favorite !== undefined && typeof node.favorite !== 'boolean') {
        throw new Error(`代理“${node.name}”的 favorite 必须为布尔值`)
      }
      if (
        node.type !== 'rule' ||
        typeof node.enabled !== 'boolean' ||
        typeof node.sourceUrl !== 'string' ||
        typeof node.targetUrl !== 'string'
      ) {
        throw new Error(`代理“${node.name}”的字段不完整或类型错误`)
      }
    } else if (
      node.type !== 'script' ||
      typeof node.content !== 'string' ||
      (node.createdAt !== undefined && typeof node.createdAt !== 'string') ||
      (node.updatedAt !== undefined && typeof node.updatedAt !== 'string')
    ) {
      throw new Error(`脚本“${node.name}”的字段不完整或类型错误`)
    }
  }

  value.groups.forEach(group => {
    if (!isRecord(group) || group.type !== 'group') throw new Error('顶层节点必须是分组')
    validateNode(group, undefined, 0)
  })
}

/**
 * 旧版代理和脚本都导出 config 字段；优先根据节点识别，空树使用旧文件名识别。
 */
function detectLegacyKind(config: unknown, filename: string): ConfigKind {
  const kinds = new Set<ConfigKind>()
  const visit = (node: unknown, depth: number) => {
    if (depth > 100) throw new Error('配置分组嵌套过深')
    if (!isRecord(node)) return
    if (node.type === 'rule' || (node.type === 'group' && typeof node.enabled === 'boolean'))
      kinds.add('proxy')
    if (node.type === 'script') kinds.add('script')
    if (Array.isArray(node.children)) node.children.forEach(child => visit(child, depth + 1))
  }
  if (isRecord(config) && Array.isArray(config.groups))
    config.groups.forEach(group => visit(group, 0))
  if (kinds.size > 1) throw new Error('旧版文件混合了代理和脚本节点')
  if (kinds.size === 1) return [...kinds][0]!
  if (/^proxy-config-/i.test(filename)) return 'proxy'
  if (/^script-config-/i.test(filename)) return 'script'
  throw new Error('无法识别旧版空配置类型，请保留 proxy-config- 或 script-config- 文件名前缀')
}

/**
 * 仅在导入边界兼容旧文件格式；配置树本身保持现有业务结构。
 */
export function parseBackup(text: string, filename = ''): Backup {
  const value: unknown = JSON.parse(text)
  if (!isRecord(value)) throw new Error('无效的配置文件')
  if (value.version !== undefined && value.version !== '1.0.0')
    throw new Error('不支持此配置文件版本')
  const data: ConfigData = {}
  if ('config' in value) {
    if ('proxyConfig' in value || 'scriptConfig' in value) throw new Error('配置文件混用了新旧格式')
    const kind = detectLegacyKind(value.config, filename)
    validateConfig(value.config, kind)
    if (kind === 'proxy') data.proxyConfig = structuredClone(value.config) as ProxyConfig
    else data.scriptConfig = structuredClone(value.config) as ScriptConfig
  } else {
    if ('proxyConfig' in value) {
      validateConfig(value.proxyConfig, 'proxy')
      data.proxyConfig = structuredClone(value.proxyConfig) as ProxyConfig
    }
    if ('scriptConfig' in value) {
      validateConfig(value.scriptConfig, 'script')
      data.scriptConfig = structuredClone(value.scriptConfig) as ScriptConfig
    }
  }
  if (!data.proxyConfig && !data.scriptConfig) throw new Error('文件中没有代理或脚本配置')
  return {
    version: '1.0.0',
    ...(typeof value.exportTime === 'string' ? { exportTime: value.exportTime } : {}),
    ...data
  }
}

/**
 * 根据明确的导出范围创建独立快照；时间由调用方传入，保证相同输入得到相同输出。
 */
export function createBackup(
  scope: ExportScope,
  proxyConfig: ProxyConfig,
  scriptConfig: ScriptConfig,
  exportTime: string
): Backup {
  return structuredClone({
    version: '1.0.0',
    exportTime,
    ...(scope !== 'script' ? { proxyConfig } : {}),
    ...(scope !== 'proxy' ? { scriptConfig } : {})
  })
}

/**
 * 同级同类型同名的本地节点优先，同名分组递归合并；新节点 ID 冲突时确定性重分配。
 * 重新分配只发生在导入边界，并同步父子引用，不修改原始配置或导入对象。
 */
function mergeNodes(local: Node[], incoming: Node[]): Node[] {
  const usedIds = new Set<string>()
  const collectIds = (nodes: Node[]) =>
    nodes.forEach(node => {
      usedIds.add(node.id)
      if (node.type === 'group') collectIds(node.children)
    })
  collectIds(local)
  let suffix = 0
  const allocateId = (original: string) => {
    let id = original
    while (usedIds.has(id)) id = `import-${original}-${++suffix}`
    usedIds.add(id)
    return id
  }
  const cloneIncoming = (node: Node, parentId?: string): Node => {
    const id = allocateId(node.id)
    if (node.type === 'group') {
      return {
        ...node,
        id,
        parentId,
        children: node.children.map(child => cloneIncoming(child, id))
      } as Group
    }
    return { ...node, id, groupId: parentId! }
  }
  const mergeLevel = (existing: Node[], added: Node[], parentId?: string): Node[] => {
    const result = structuredClone(existing)
    for (const node of added) {
      const index = result.findIndex(item => item.type === node.type && item.name === node.name)
      if (index === -1) {
        result.push(cloneIncoming(node, parentId))
      } else {
        const current = result[index]!
        if (current.type === 'group' && node.type === 'group') {
          result[index] = {
            ...current,
            children: mergeLevel(current.children, node.children, current.id)
          } as Group
        }
      }
    }
    return result
  }
  return mergeLevel(local, incoming)
}

/**
 * 覆盖仅影响文件包含的类型；增量保留本地总开关和节点内容，并补充缺失项。
 * 根节点已经限定为分组，因此合并结果在此恢复对应业务树类型。
 */
export function applyBackup(
  current: Required<ConfigData>,
  backup: Backup,
  mode: ImportMode
): ConfigData {
  const result: ConfigData = {}
  if (backup.proxyConfig) {
    result.proxyConfig =
      mode === 'replace'
        ? structuredClone(backup.proxyConfig)
        : {
            ...structuredClone(current.proxyConfig),
            groups: mergeNodes(
              current.proxyConfig.groups,
              backup.proxyConfig.groups
            ) as ProxyGroup[]
          }
  }
  if (backup.scriptConfig) {
    result.scriptConfig =
      mode === 'replace'
        ? structuredClone(backup.scriptConfig)
        : {
            ...structuredClone(current.scriptConfig),
            groups: mergeNodes(
              current.scriptConfig.groups,
              backup.scriptConfig.groups
            ) as ScriptGroup[]
          }
  }
  return result
}

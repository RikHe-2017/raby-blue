// 树节点类型：分组或脚本
export type ScriptNode = ScriptGroup | Script

export interface Script {
  id: string
  name: string
  content: string
  groupId: string
  type: 'script' // 类型标识，用于区分 group 和 script
  createdAt?: string
  updatedAt?: string
  favorite?: boolean
}

export interface ScriptGroup {
  id: string
  name: string
  type: 'group' // 类型标识，用于区分 group 和 script
  parentId?: string // 父分组ID，如果为空则为顶级分组
  children: ScriptNode[] // 统一的 children，包含子分组和脚本
}

// 类型守卫函数
export function isScriptGroup(node: ScriptNode): node is ScriptGroup {
  return node.type === 'group'
}

export function isScript(node: ScriptNode): node is Script {
  return node.type === 'script'
}

export interface ScriptConfig {
  enabled: boolean
  groups: ScriptGroup[]
}

export const DEFAULT_SCRIPT_CONFIG: ScriptConfig = {
  enabled: false,
  groups: []
}

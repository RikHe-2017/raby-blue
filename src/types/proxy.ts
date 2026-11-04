// 树节点类型：分组或规则
export type ProxyNode = ProxyGroup | ProxyRule

export type HeaderSettingMode = 'overwrite' | 'merge'

export interface HeaderSetting {
  id: string
  enabled: boolean
  name: string
  value: string
  mode?: HeaderSettingMode
}

export interface ProxyRule {
  id: string
  name: string
  enabled: boolean
  favorite?: boolean // 未填写视为未收藏，兼容旧配置
  showSuccessNotification?: boolean // 未填写视为关闭页面代理成功提示
  sourceUrl: string
  targetUrl: string
  requestHeaders?: HeaderSetting[]
  responseHeaders?: HeaderSetting[]
  groupId: string
  type: 'rule' // 类型标识，用于区分 group 和 rule
}

export interface ProxyGroup {
  id: string
  name: string
  enabled: boolean
  type: 'group' // 类型标识，用于区分 group 和 rule
  parentId?: string // 父分组ID，如果为空则为顶级分组
  children: ProxyNode[] // 统一的 children，包含子分组和规则
}

export interface ProxyConfig {
  enabled: boolean
  groups: ProxyGroup[]
}

export const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  enabled: false,
  groups: []
}

// 类型守卫函数
export function isProxyGroup(node: ProxyNode): node is ProxyGroup {
  return node.type === 'group'
}

export function isProxyRule(node: ProxyNode): node is ProxyRule {
  return node.type === 'rule'
}

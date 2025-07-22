export interface ProxyRule {
  id: string
  name: string
  enabled: boolean
  sourceUrl: string
  targetUrl: string
  groupId: string
}

export interface ProxyGroup {
  id: string
  name: string
  enabled: boolean
  rules: ProxyRule[]
  parentId?: string // 父分组ID，如果为空则为顶级分组
  children?: ProxyGroup[] // 子分组
}

export interface ProxyConfig {
  enabled: boolean
  groups: ProxyGroup[]
}

export const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  enabled: false,
  groups: []
}

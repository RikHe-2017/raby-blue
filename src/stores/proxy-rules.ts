import type { ProxyGroup, ProxyNode, ProxyRule } from '../types/proxy'

export type ProxyRuleChanges = Partial<
  Pick<
    ProxyRule,
    | 'enabled'
    | 'favorite'
    | 'name'
    | 'sourceUrl'
    | 'targetUrl'
    | 'requestHeaders'
    | 'responseHeaders'
  >
>

export function updateProxyRule(
  groups: ProxyGroup[],
  ruleId: string,
  changes: ProxyRuleChanges
): ProxyGroup[] {
  const updateNode = (node: ProxyNode): ProxyNode => {
    if (node.type === 'group') {
      const children = node.children.map(updateNode)
      return children.some((child, index) => child !== node.children[index])
        ? { ...node, children }
        : node
    }
    if (
      node.id !== ruleId ||
      Object.entries(changes).every(([key, value]) => node[key as keyof ProxyRule] === value)
    )
      return node
    return { ...node, ...changes }
  }
  const next = groups.map(group => updateNode(group) as ProxyGroup)
  return next.some((group, index) => group !== groups[index]) ? next : groups
}

export function getProxyFavoriteSummary(node: ProxyNode): {
  ruleCount: number
  favoriteCount: number
} {
  if (node.type === 'rule') return { ruleCount: 1, favoriteCount: node.favorite === true ? 1 : 0 }
  return node.children.reduce(
    (total, child) => {
      const summary = getProxyFavoriteSummary(child)
      return {
        ruleCount: total.ruleCount + summary.ruleCount,
        favoriteCount: total.favoriteCount + summary.favoriteCount
      }
    },
    { ruleCount: 0, favoriteCount: 0 }
  )
}

export function setProxyNodeFavorite(
  groups: ProxyGroup[],
  nodeId: string,
  favorite: boolean
): ProxyGroup[] {
  const update = (node: ProxyNode, selected: boolean): ProxyNode => {
    const included = selected || node.id === nodeId
    if (node.type === 'rule')
      return included && node.favorite !== favorite ? { ...node, favorite } : node
    const children = node.children.map(child => update(child, included))
    return children.some((child, index) => child !== node.children[index])
      ? { ...node, children }
      : node
  }
  const next = groups.map(group => update(group, false) as ProxyGroup)
  return next.some((group, index) => group !== groups[index]) ? next : groups
}

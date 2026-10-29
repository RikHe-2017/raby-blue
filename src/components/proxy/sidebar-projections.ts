import type { ProxyGroup, ProxyNode, ProxyRule } from '../../types/proxy'

export interface ProxyEntry {
  rule: ProxyRule
  path: string
}

export function collectProxyEntries(groups: ProxyGroup[], ancestors: string[] = []): ProxyEntry[] {
  return groups.flatMap(group => {
    const path = [...ancestors, group.name]
    return group.children.flatMap(node =>
      node.type === 'rule'
        ? [{ rule: node, path: path.join(' / ') }]
        : collectProxyEntries([node], path)
    )
  })
}

export function filterProxyEntries(entries: ProxyEntry[], keyword: string): ProxyEntry[] {
  const query = keyword.trim().toLowerCase()
  if (!query) return entries
  return entries.filter(
    entry =>
      entry.rule.name.toLowerCase().includes(query) || entry.path.toLowerCase().includes(query)
  )
}

export function filterProxyGroups(groups: ProxyGroup[], ruleIds: string[]): ProxyGroup[] {
  const included = new Set(ruleIds)
  const prune = (group: ProxyGroup): ProxyGroup[] => {
    const children = group.children.flatMap<ProxyNode>(node =>
      node.type === 'group' ? prune(node) : included.has(node.id) ? [node] : []
    )
    return children.length ? [{ ...group, children }] : []
  }
  return groups.flatMap(prune)
}

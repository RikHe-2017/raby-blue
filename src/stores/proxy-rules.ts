import type { ProxyGroup, ProxyNode, ProxyRule } from '../types/proxy'

export type ProxyRuleChanges = Partial<
  Pick<ProxyRule, 'enabled' | 'favorite' | 'name' | 'sourceUrl' | 'targetUrl'>
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

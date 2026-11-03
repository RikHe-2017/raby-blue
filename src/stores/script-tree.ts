import type { Script, ScriptGroup, ScriptNode } from '../types/script'

export function findScriptNode(groups: ScriptGroup[], id: string): ScriptNode | undefined {
  for (const group of groups) {
    if (group.id === id) return group
    for (const node of group.children) {
      if (node.id === id) return node
      if (node.type === 'group') {
        const found = findScriptNode([node], id)
        if (found) return found
      }
    }
  }
}

function mapScriptGroups(
  groups: ScriptGroup[],
  update: (node: ScriptNode) => ScriptNode
): ScriptGroup[] {
  const visit = (node: ScriptNode): ScriptNode => {
    if (node.type === 'script') return update(node)
    const children = node.children.map(visit)
    return update(
      children.some((child, index) => child !== node.children[index]) ? { ...node, children } : node
    )
  }
  const next = groups.map(group => visit(group) as ScriptGroup)
  return next.some((group, index) => group !== groups[index]) ? next : groups
}

export function updateScriptNode(
  groups: ScriptGroup[],
  id: string,
  changes: Partial<Pick<Script, 'name' | 'content' | 'favorite' | 'updatedAt'>>
): ScriptGroup[] {
  return mapScriptGroups(groups, node =>
    node.id === id &&
    Object.entries(changes).some(([key, value]) => node[key as keyof ScriptNode] !== value)
      ? { ...node, ...changes }
      : node
  )
}

export function insertScriptNode(
  groups: ScriptGroup[],
  node: ScriptNode,
  parentId?: string
): ScriptGroup[] {
  if (!parentId) return node.type === 'group' ? [...groups, node] : groups
  const child = node.type === 'group' ? { ...node, parentId } : { ...node, groupId: parentId }
  return mapScriptGroups(groups, current =>
    current.type === 'group' && current.id === parentId
      ? { ...current, children: [...current.children, child] }
      : current
  )
}

export function removeScriptNode(groups: ScriptGroup[], id: string): ScriptGroup[] {
  const prune = (node: ScriptNode): ScriptNode[] => {
    if (node.id === id) return []
    if (node.type === 'script') return [node]
    const children = node.children.flatMap(prune)
    return [
      children.length !== node.children.length ||
      children.some((child, index) => child !== node.children[index])
        ? { ...node, children }
        : node
    ]
  }
  const next = groups.flatMap(group => prune(group) as ScriptGroup[])
  return next.length !== groups.length || next.some((group, index) => group !== groups[index])
    ? next
    : groups
}

export function getScriptFavoriteSummary(node: ScriptNode): {
  scriptCount: number
  favoriteCount: number
} {
  if (node.type === 'script')
    return { scriptCount: 1, favoriteCount: node.favorite === true ? 1 : 0 }
  return node.children.reduce(
    (total, child) => {
      const summary = getScriptFavoriteSummary(child)
      return {
        scriptCount: total.scriptCount + summary.scriptCount,
        favoriteCount: total.favoriteCount + summary.favoriteCount
      }
    },
    { scriptCount: 0, favoriteCount: 0 }
  )
}

export function setScriptNodeFavorite(
  groups: ScriptGroup[],
  id: string,
  favorite: boolean
): ScriptGroup[] {
  const update = (node: ScriptNode, ancestorSelected: boolean): ScriptNode => {
    const selected = ancestorSelected || node.id === id
    if (node.type === 'script')
      return selected && node.favorite !== favorite ? { ...node, favorite } : node
    const children = node.children.map(child => update(child, selected))
    return children.some((child, index) => child !== node.children[index])
      ? { ...node, children }
      : node
  }
  const next = groups.map(group => update(group, false) as ScriptGroup)
  return next.some((group, index) => group !== groups[index]) ? next : groups
}

import type { Script, ScriptGroup, ScriptNode } from '../../types/script'

export interface ScriptEntry {
  script: Script
  path: string
}

export function collectScriptEntries(
  groups: ScriptGroup[],
  ancestors: string[] = []
): ScriptEntry[] {
  return groups.flatMap(group => {
    const path = [...ancestors, group.name]
    return group.children.flatMap(node =>
      node.type === 'script'
        ? [{ script: node, path: path.join(' / ') }]
        : collectScriptEntries([node], path)
    )
  })
}

export function filterScriptEntries(entries: ScriptEntry[], keyword: string): ScriptEntry[] {
  const query = keyword.trim().toLowerCase()
  return query
    ? entries.filter(
        entry =>
          entry.script.name.toLowerCase().includes(query) ||
          entry.path.toLowerCase().includes(query)
      )
    : entries
}

export function filterScriptGroups(groups: ScriptGroup[], scriptIds: string[]): ScriptGroup[] {
  const included = new Set(scriptIds)
  const prune = (group: ScriptGroup): ScriptGroup[] => {
    const children = group.children.flatMap<ScriptNode>(node =>
      node.type === 'group' ? prune(node) : included.has(node.id) ? [node] : []
    )
    return children.length ? [{ ...group, children }] : []
  }
  return groups.flatMap(prune)
}

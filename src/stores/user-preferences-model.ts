export interface TreeUIState {
  expandedKeys: string[]
  activeGroupId: string
  activeItemId: string
}

export interface SidebarPreferences {
  selectedGrouped: boolean
  favoritesGrouped: boolean
  openPanels: string[]
}

export interface UserPreferences {
  activeTab: 'proxy' | 'script'
  proxySidebar: SidebarPreferences
  proxyUIState: TreeUIState
  scriptUIState: TreeUIState
  scriptSidebar: ScriptSidebarPreferences
}

export interface ScriptSidebarPreferences {
  favoritesGrouped: boolean
  openPanels: string[]
  favoritesExpandedKeys: string[]
}

export interface UserPreferencesPatch {
  activeTab?: UserPreferences['activeTab']
  proxySidebar?: Partial<SidebarPreferences>
  proxyUIState?: Partial<TreeUIState>
  scriptUIState?: Partial<TreeUIState>
  scriptSidebar?: Partial<ScriptSidebarPreferences>
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string'))]
    : []

export const createDefaultTreeState = (): TreeUIState => ({
  expandedKeys: [],
  activeGroupId: '',
  activeItemId: ''
})

export function normalizeSidebarPreferences(value: unknown): SidebarPreferences {
  const saved = record(value)
  return {
    selectedGrouped: saved.selectedGrouped === true,
    favoritesGrouped: saved.favoritesGrouped === true,
    openPanels: Array.isArray(saved.openPanels)
      ? strings(saved.openPanels).filter(panel =>
          ['config', 'selected', 'favorites'].includes(panel)
        )
      : ['config', 'selected', 'favorites']
  }
}

function normalizeTreeState(value: unknown): TreeUIState {
  const saved = record(value)
  return {
    expandedKeys: strings(saved.expandedKeys),
    activeGroupId: typeof saved.activeGroupId === 'string' ? saved.activeGroupId : '',
    activeItemId: typeof saved.activeItemId === 'string' ? saved.activeItemId : ''
  }
}

export function normalizeUserPreferences(value: unknown): UserPreferences {
  const saved = record(value)
  const scriptSidebar = record(saved.scriptSidebar)
  return {
    activeTab: saved.activeTab === 'script' ? 'script' : 'proxy',
    proxySidebar: normalizeSidebarPreferences(saved.proxySidebar),
    proxyUIState: normalizeTreeState(saved.proxyUIState),
    scriptUIState: normalizeTreeState(saved.scriptUIState),
    scriptSidebar: {
      favoritesGrouped: scriptSidebar.favoritesGrouped === true,
      openPanels: Array.isArray(scriptSidebar.openPanels)
        ? strings(scriptSidebar.openPanels).filter(panel => ['favorites', 'config'].includes(panel))
        : ['favorites', 'config'],
      favoritesExpandedKeys: strings(scriptSidebar.favoritesExpandedKeys)
    }
  }
}

export function mergeUserPreferences(
  current: UserPreferences,
  patch: UserPreferencesPatch
): UserPreferences {
  return normalizeUserPreferences({
    ...current,
    ...patch,
    proxySidebar: { ...current.proxySidebar, ...patch.proxySidebar },
    proxyUIState: { ...current.proxyUIState, ...patch.proxyUIState },
    scriptUIState: { ...current.scriptUIState, ...patch.scriptUIState },
    scriptSidebar: { ...current.scriptSidebar, ...patch.scriptSidebar }
  })
}

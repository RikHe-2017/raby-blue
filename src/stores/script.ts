import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import type { ScriptConfig, ScriptGroup, Script } from '../types/script'
import { DEFAULT_SCRIPT_CONFIG } from '../types/script'
import {
  findScriptNode,
  insertScriptNode,
  removeScriptNode,
  setScriptNodeFavorite,
  updateScriptNode
} from './script-tree'
import { createStorageAdapter } from './storage'
import { useUserPreferencesStore } from './user-preferences'
import type { TreeUIState } from './user-preferences-model'

const storage = createStorageAdapter()

export const useScriptStore = defineStore('script', () => {
  const config = ref<ScriptConfig>(structuredClone(DEFAULT_SCRIPT_CONFIG))
  const userPreferences = useUserPreferencesStore()
  let saving: Promise<unknown> = Promise.resolve()

  const enabled = computed(() => config.value.enabled)
  const groups = computed(() => config.value.groups)

  const commit = (update: (current: ScriptConfig) => ScriptConfig) => {
    const operation = saving
      .catch(() => {})
      .then(async () => {
        const next = update(config.value)
        if (next === config.value) return false
        await storage.set('scriptConfig', JSON.parse(JSON.stringify(next)))
        config.value = next
        return true
      })
    saving = operation
    return operation
  }

  const updateGroups = (update: (groups: ScriptGroup[]) => ScriptGroup[]) =>
    commit(current => {
      const next = update(current.groups)
      return next === current.groups ? current : { ...current, groups: next }
    })

  const toggleGlobalScript = () => commit(current => ({ ...current, enabled: !current.enabled }))

  const addGroup = (group: ScriptGroup, parentId?: string) => {
    const snapshot = structuredClone(toRaw(group))
    return updateGroups(groups => insertScriptNode(groups, snapshot, parentId))
  }

  const updateGroup = (groupId: string, updatedGroup: Partial<ScriptGroup>) => {
    const name = updatedGroup.name
    return updateGroups(groups =>
      name !== undefined && findScriptNode(groups, groupId)?.type === 'group'
        ? updateScriptNode(groups, groupId, { name })
        : groups
    )
  }

  const deleteGroup = (groupId: string) =>
    updateGroups(groups =>
      findScriptNode(groups, groupId)?.type === 'group' ? removeScriptNode(groups, groupId) : groups
    )

  const addScript = (groupId: string, script: Script) => {
    const now = new Date().toISOString()
    const snapshot = { ...structuredClone(toRaw(script)), createdAt: now, updatedAt: now }
    return updateGroups(groups => insertScriptNode(groups, snapshot, groupId))
  }

  const updateScript = (groupId: string, scriptId: string, updatedScript: Partial<Script>) => {
    const snapshot = { ...updatedScript, updatedAt: new Date().toISOString() }
    return updateGroups(groups => {
      const script = findScriptNode(groups, scriptId)
      return script?.type === 'script' && script.groupId === groupId
        ? updateScriptNode(groups, scriptId, snapshot)
        : groups
    })
  }

  const deleteScript = (groupId: string, scriptId: string) => {
    return updateGroups(groups => {
      const script = findScriptNode(groups, scriptId)
      return script?.type === 'script' && script.groupId === groupId
        ? removeScriptNode(groups, scriptId)
        : groups
    })
  }

  const setFavorite = (nodeId: string, favorite: boolean) =>
    updateGroups(groups => setScriptNodeFavorite(groups, nodeId, favorite))

  const saveConfig = () => {
    const operation = saving
      .catch(() => {})
      .then(() => storage.set('scriptConfig', JSON.parse(JSON.stringify(config.value))))
    saving = operation
    return operation
  }

  const loadConfig = () => {
    const operation = saving
      .catch(() => {})
      .then(async () => {
        const result = await storage.get('scriptConfig')
        if (result) config.value = result
      })
    saving = operation
    return operation
  }

  const uiState = computed(() => userPreferences.preferences.scriptUIState)

  const saveUIState = (patch: Partial<TreeUIState>) =>
    userPreferences.update({ scriptUIState: patch })

  const loadUIState = () => userPreferences.load()

  return {
    config,
    enabled,
    groups,
    uiState,
    toggleGlobalScript,
    addGroup,
    updateGroup,
    deleteGroup,
    addScript,
    updateScript,
    deleteScript,
    setFavorite,
    saveConfig,
    loadConfig,
    saveUIState,
    loadUIState
  }
})

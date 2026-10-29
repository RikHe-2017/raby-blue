import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { createStorageAdapter } from './storage'
import { mergeUserPreferences, normalizeUserPreferences } from './user-preferences-model'
import type { UserPreferencesPatch } from './user-preferences-model'

const storage = createStorageAdapter()

export const useUserPreferencesStore = defineStore('user-preferences', () => {
  const preferences = ref(normalizeUserPreferences(undefined))
  const ready = ref(false)
  let loading: Promise<void> | undefined
  let saving = Promise.resolve()
  let persisted = normalizeUserPreferences(undefined)
  let revision = 0

  const load = () => {
    if (loading) return loading
    loading = (async () => {
      try {
        preferences.value = normalizeUserPreferences(await storage.get('userPreferences'))
        persisted = normalizeUserPreferences(preferences.value)
      } catch {
        ElMessage.error('用户偏好加载失败')
      } finally {
        ready.value = true
      }
    })()
    return loading
  }

  const save = async (patch: UserPreferencesPatch, values: Record<string, unknown> = {}) => {
    await load()
    const next = mergeUserPreferences(preferences.value, patch)
    const currentRevision = ++revision
    preferences.value = next
    // All sections share one write queue; import can commit preferences and business data together.
    const operation = saving.then(async () => {
      await storage.setMany({ ...values, userPreferences: next })
      persisted = next
    })
    saving = operation.catch(() => {})
    try {
      await operation
    } catch (error) {
      if (revision === currentRevision) preferences.value = persisted
      throw error
    }
  }

  const update = (patch: UserPreferencesPatch) =>
    save(patch).catch(() => {
      ElMessage.error('用户偏好保存失败，请重试')
    })

  return { preferences, ready, load, save, update }
})

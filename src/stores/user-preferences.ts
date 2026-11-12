import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { createStorageAdapter } from './storage'
import { mergeUserPreferences, normalizeUserPreferences } from './user-preferences-model'
import type { UserPreferencesPatch } from './user-preferences-model'
import { i18n } from '../locales'

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
        i18n.global.locale.value = preferences.value.locale
      } catch {
        ElMessage.error(i18n.global.t('runtime.preferencesLoadFailed'))
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
    i18n.global.locale.value = next.locale
    // All sections share one write queue; import can commit preferences and business data together.
    const operation = saving.then(async () => {
      await storage.setMany({ ...values, userPreferences: next })
      persisted = next
    })
    saving = operation.catch(() => {})
    try {
      await operation
    } catch (error) {
      if (revision === currentRevision) {
        preferences.value = persisted
        i18n.global.locale.value = persisted.locale
      }
      throw error
    }
  }

  const update = (patch: UserPreferencesPatch) =>
    save(patch).catch(() => {
      ElMessage.error(i18n.global.t('runtime.preferencesSaveFailed'))
    })

  return { preferences, ready, load, save, update }
})

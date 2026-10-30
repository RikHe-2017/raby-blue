import { reactive } from 'vue'
import type { HeaderSetting, ProxyRule } from '../../types/proxy'
import { validateHeaderSettings } from '../../proxy/header-settings.ts'

export type HeaderField = 'requestHeaders' | 'responseHeaders'
interface HeaderDraft {
  rows: HeaderSetting[]
  saved: boolean
  error: string
  dirty: boolean
  revision: number
  base: string
  saving: number
  invalid: boolean
}
const copyRows = (rows: HeaderSetting[] = []) => rows.map(row => ({ ...row }))
const signature = (rows: HeaderSetting[] = []) => JSON.stringify(rows)

export function createHeaderDrafts(
  readRule: (id: string) => ProxyRule | undefined,
  save: (id: string, patch: Partial<Pick<ProxyRule, HeaderField>>) => Promise<void>
) {
  const states = reactive(new Map<string, HeaderDraft>())
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const pending = new Map<string, Promise<void>>()
  let queue = Promise.resolve()
  let revisionSequence = 0
  const keyOf = (id: string, field: HeaderField) => `${id}:${field}`

  const get = (id: string, field: HeaderField): HeaderDraft => {
    const key = keyOf(id, field)
    const rows = readRule(id)?.[field] ?? []
    const current = states.get(key)
    if (!current || (!current.saving && signature(rows) !== current.base)) {
      states.set(key, {
        rows: copyRows(rows),
        saved: true,
        error: '',
        dirty: false,
        revision: 0,
        base: signature(rows),
        saving: 0,
        invalid: false
      })
    }
    return states.get(key)!
  }

  const persist = (id: string, field: HeaderField): Promise<void> => {
    const key = keyOf(id, field)
    const state = get(id, field)
    if (!state.dirty || state.invalid) return Promise.resolve()
    const revision = state.revision
    const operationKey = `${key}:${revision}`
    if (pending.has(operationKey)) return pending.get(operationKey)!
    const rows = copyRows(state.rows)
    state.saving++
    const operation = queue
      .catch(() => {})
      .then(async () => {
        const current = readRule(id)
        if (!current || states.get(key) !== state) return
        if (signature(current[field]) !== state.base) {
          states.delete(key)
          return
        }
        try {
          await save(id, { [field]: rows })
          state.base = signature(rows)
          if (state.revision === revision) {
            state.dirty = false
            state.saved = true
            state.error = ''
          }
        } catch (error) {
          state.base = signature(readRule(id)?.[field])
          if (state.revision === revision) {
            state.saved = false
            state.error = `保存失败：${String(error)}`
          }
          throw error
        }
      })
      .finally(() => {
        state.saving--
        pending.delete(operationKey)
      })
    queue = operation
    pending.set(operationKey, operation)
    return operation
  }

  const change = (id: string, field: HeaderField, rows: HeaderSetting[]) => {
    const state = get(id, field)
    state.rows = copyRows(rows)
    state.revision = ++revisionSequence
    state.dirty = true
    state.saved = false
    state.error = ''
    state.invalid = false
    try {
      validateHeaderSettings(rows, field === 'requestHeaders' ? 'request' : 'response')
    } catch (error) {
      state.error = (error as Error).message
      state.invalid = true
    }
    const key = keyOf(id, field)
    clearTimeout(timers.get(key))
    timers.delete(key)
    if (!state.error)
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key)
          void persist(id, field).catch(() => {})
        }, 500)
      )
  }

  const flush = async () => {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    const operations = [...pending.values()]
    for (const key of states.keys()) {
      const split = key.lastIndexOf(':')
      operations.push(persist(key.slice(0, split), key.slice(split + 1) as HeaderField))
    }
    await Promise.all(operations)
  }

  const dispose = () => {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
  }

  return { get, change, flush, dispose }
}

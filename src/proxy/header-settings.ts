import type { HeaderSetting } from '../types/proxy'
import { i18n } from '../locales'

export type HeaderDirection = 'request' | 'response'

const transportHeaders = new Set([
  'connection',
  'content-length',
  'content-encoding',
  'transfer-encoding',
  'keep-alive',
  'te',
  'trailer',
  'upgrade',
  'proxy-authenticate',
  'proxy-authorization'
])
const protectedRequestHeaders = new Set([
  'host',
  'cookie',
  'cookie2',
  'set-cookie',
  'set-cookie2',
  'user-agent',
  'origin',
  'referer',
  'accept-encoding',
  'accept-charset',
  'access-control-request-method',
  'access-control-request-headers',
  'expect',
  'date',
  'dnt',
  'permissions-policy',
  'x-http-method',
  'x-http-method-override',
  'x-method-override',
  'via'
])

export function createHeaderSetting(id: string): HeaderSetting {
  return { id, enabled: true, name: '', value: '', mode: 'overwrite' }
}

export function validateHeaderSettings(value: unknown, direction: HeaderDirection): void {
  if (value === undefined) return
  if (!Array.isArray(value)) throw new Error(i18n.global.t('runtime.headerArrayRequired'))
  const names = new Set<string>()
  const ids = new Set<string>()
  for (const row of value) {
    if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id))
      throw new Error(i18n.global.t('runtime.headerIdInvalid'))
    ids.add(row.id)
    if (
      typeof row.enabled !== 'boolean' ||
      typeof row.name !== 'string' ||
      typeof row.value !== 'string' ||
      (row.mode !== undefined && row.mode !== 'overwrite' && row.mode !== 'merge')
    )
      throw new Error(i18n.global.t('runtime.headerFieldInvalid'))
    const name = row.name.trim()
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name))
      throw new Error(i18n.global.t('runtime.headerNameInvalid'))
    const key = name.toLowerCase()
    if (names.has(key)) throw new Error(i18n.global.t('runtime.headerNameDuplicate', { name }))
    names.add(key)
    if (/[\x00-\x08\x0a-\x1f\x7f-\uffff]/.test(row.value))
      throw new Error(i18n.global.t('runtime.headerValueInvalid', { name }))
    if (
      transportHeaders.has(key) ||
      key.startsWith('sec-') ||
      key.startsWith('proxy-') ||
      (direction === 'request' && protectedRequestHeaders.has(key)) ||
      (direction === 'response' && (key === 'set-cookie' || key === 'set-cookie2'))
    )
      throw new Error(i18n.global.t('runtime.headerUnsupported', { name }))
  }
}

export function mergeHeaderSettings(
  original: [string, string][],
  settings: HeaderSetting[] = []
): [string, string][] {
  const active = settings.filter(row => row.enabled)
  const replaced = new Set(
    active.filter(row => row.mode !== 'merge').map(row => row.name.trim().toLowerCase())
  )
  return [
    ...original
      .filter(([name]) => !replaced.has(name.toLowerCase()))
      .map(([name, value]): [string, string] => [name, value]),
    ...active.map((row): [string, string] => [row.name.trim(), row.value])
  ]
}

export function hasHeaderSettings(rule: {
  requestHeaders?: HeaderSetting[]
  responseHeaders?: HeaderSetting[]
}): boolean {
  return [...(rule.requestHeaders ?? []), ...(rule.responseHeaders ?? [])].some(row => row.enabled)
}

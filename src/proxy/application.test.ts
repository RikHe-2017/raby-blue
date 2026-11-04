import { expect, test, vi } from 'vitest'
import type { ProxyConfig } from '../types/proxy'
import { createProxyConfigPersistence } from './config-persistence'
import { createProxyApplication } from './application'
import { ProxyManager, ProxyApplicationError } from './ProxyManager'
import type { ProxyRuntimeStatus } from './runtime-status'

function fixture() {
  let saved: ProxyConfig = {
    enabled: true,
    groups: [
      {
        id: 'g',
        name: 'group',
        enabled: true,
        type: 'group',
        children: [
          {
            id: 'r',
            name: 'rule',
            groupId: 'g',
            type: 'rule',
            enabled: true,
            sourceUrl: 'http://source.test/',
            targetUrl: 'http://localhost/'
          }
        ]
      }
    ]
  }
  const statuses: ProxyRuntimeStatus[] = []
  const persistence = createProxyConfigPersistence({
    read: async () => saved,
    write: async config => {
      saved = structuredClone(config)
    }
  })
  const manager = {
    refresh: vi.fn(async (load: () => Promise<ProxyConfig>) => {
      await load()
    }),
    dispose: vi.fn(async () => {})
  }
  const application = createProxyApplication({
    manager,
    persistence,
    readConfig: async () => saved,
    publish: async status => {
      statuses.push(status)
    }
  })
  return { application, manager, persistence, statuses, read: () => saved }
}

test('save acknowledgement waits for both strategies and never announces active early', async () => {
  const f = fixture()
  let finish!: () => void
  f.manager.refresh.mockImplementationOnce(async load => {
    await load()
    await new Promise<void>(resolve => {
      finish = resolve
    })
  })
  let acknowledged = false
  const saving = f.application.save(f.read(), true).then(() => {
    acknowledged = true
  })
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  expect(f.application.getStatus().phase).toBe('applying')
  expect(acknowledged).toBe(false)
  finish()
  await saving
  expect(f.application.getStatus().phase).toBe('active')
})

test('failed initialization disables only the master, preserves selections and keeps a visible error', async () => {
  const f = fixture()
  const before = structuredClone(f.read())
  f.manager.refresh.mockRejectedValueOnce(new ProxyApplicationError('debugger failed'))
  await expect(f.application.save(f.read(), true)).rejects.toThrow('debugger failed')
  expect(f.read()).toEqual({ ...before, enabled: false })
  expect(f.application.getStatus()).toMatchObject({
    phase: 'error',
    message: expect.stringContaining('debugger failed')
  })
  await f.application.refresh()
  expect(f.application.getStatus().phase).toBe('error')
  await f.application.save({ ...f.read(), enabled: true }, true)
  expect(f.application.getStatus().phase).toBe('active')
  expect(f.read().groups[0].children[0].enabled).toBe(true)
})

test('cleanup failure stays explicit, never a successful disabled state', async () => {
  const f = fixture()
  f.manager.refresh.mockRejectedValueOnce(
    new ProxyApplicationError('apply failed', ['detach denied'])
  )
  await f.application.refresh()
  expect(f.application.getStatus()).toMatchObject({
    phase: 'error',
    cleanupFailed: true,
    message: expect.stringContaining('detach denied')
  })
  expect(f.read().enabled).toBe(false)
})

test('duplicate storage notifications do not reinitialize an unchanged active configuration', async () => {
  const f = fixture()
  const response = { update: vi.fn(async () => {}), dispose: vi.fn(async () => {}) }
  const redirect = { update: vi.fn(async () => {}), dispose: vi.fn(async () => {}) }
  const application = createProxyApplication({
    manager: new ProxyManager({ response, redirect }),
    persistence: f.persistence,
    readConfig: async () => f.read(),
    publish: async () => {}
  })
  await application.save(f.read(), true)
  await application.refresh()
  expect(response.update).toHaveBeenCalledTimes(1)
  expect(redirect.update).toHaveBeenCalledTimes(1)
})

test('failure to persist master-off is exposed as unconfirmed shutdown, not a clean disable', async () => {
  const f = fixture()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(f.persistence, 'disable').mockRejectedValueOnce(new Error('storage denied'))
  f.manager.refresh.mockRejectedValueOnce(new ProxyApplicationError('apply failed'))
  await f.application.refresh()
  expect(f.application.getStatus()).toMatchObject({
    phase: 'error',
    cleanupFailed: true,
    message: expect.stringContaining('storage denied')
  })
  expect(f.read().enabled).toBe(true)
})

test('after a failed enable, users can save corrected settings while off without losing the error report', async () => {
  const f = fixture()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  f.manager.refresh.mockRejectedValueOnce(new ProxyApplicationError('bad settings'))
  await f.application.refresh()
  const corrected = structuredClone(f.read())
  const rule = corrected.groups[0].children[0]
  if (rule.type !== 'rule') throw new Error('Expected a proxy rule')
  rule.targetUrl = 'http://localhost:8099/'
  await expect(f.application.save(corrected)).resolves.toMatchObject({ phase: 'error' })
  expect(f.read()).toEqual(corrected)
  expect(f.read().enabled).toBe(false)
})

test('a restarted background restores its previous error instead of silently presenting a clean shutdown', async () => {
  const f = fixture()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  f.manager.refresh.mockRejectedValueOnce(new ProxyApplicationError('initialization failed'))
  await f.application.refresh()
  const previous = f.application.getStatus()
  const restarted = createProxyApplication({
    manager: f.manager,
    persistence: f.persistence,
    readConfig: async () => f.read(),
    readStatus: async () => previous,
    publish: async () => {}
  })
  await restarted.refresh()
  expect(restarted.getStatus()).toEqual(previous)
  expect(f.read().enabled).toBe(false)
})

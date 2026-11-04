import { afterEach, expect, test, vi } from 'vitest'
import { ProxyManager } from './ProxyManager'
import type { ProxyConfig } from '../types/proxy'
import type { ProxyStrategy } from './ProxyStrategy'

const config: ProxyConfig = {
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
          type: 'rule',
          groupId: 'g',
          enabled: true,
          sourceUrl: 'http://source.test/',
          targetUrl: 'http://localhost/'
        }
      ]
    }
  ]
}

function fixture() {
  const calls: string[] = []
  const strategy = (name: string): ProxyStrategy => ({
    update: vi.fn(async () => {
      calls.push(`${name}:update`)
    }),
    dispose: vi.fn(async () => {
      calls.push(`${name}:dispose`)
    })
  })
  const strategies = { redirect: strategy('redirect'), response: strategy('response') }
  const applied = vi.fn()
  const manager = new ProxyManager(strategies, applied, {
    initializationTimeoutMs: 100,
    cleanupTimeoutMs: 50
  })
  return { calls, strategies, applied, manager }
}

afterEach(() => {
  vi.useRealTimers()
})

test('resource redirects are installed before enabling documents; active is announced only after both finish', async () => {
  const f = fixture()
  let finish!: () => void
  vi.mocked(f.strategies.response.update).mockImplementationOnce(async () => {
    f.calls.push('response:update')
    await new Promise<void>(resolve => {
      finish = resolve
    })
  })
  const update = f.manager.refresh(async () => config)
  await vi.waitFor(() => expect(f.calls).toContain('response:update'))
  expect(f.calls).toContain('redirect:update')
  expect(f.calls.indexOf('redirect:update')).toBeLessThan(f.calls.indexOf('response:update'))
  expect(f.applied.mock.calls.every(([rules]) => rules.length === 0)).toBe(true)
  finish()
  await update
  expect(f.applied).toHaveBeenLastCalledWith(
    expect.arrayContaining([expect.objectContaining({ id: 'r' })]),
    expect.any(Array)
  )
})

test('redirect installation failure never enables document replacement and clears both strategies', async () => {
  const f = fixture()
  vi.mocked(f.strategies.redirect.update).mockRejectedValueOnce(new Error('invalid redirect'))
  await expect(f.manager.refresh(async () => config)).rejects.toThrow('invalid redirect')
  expect(f.strategies.response.update).not.toHaveBeenCalled()
  expect(f.strategies.redirect.dispose).toHaveBeenCalled()
  expect(f.strategies.response.dispose).toHaveBeenCalled()
  expect(f.applied).toHaveBeenLastCalledWith([], [])
})

test('initialization deadline aborts a hung strategy and late completion cannot publish success', async () => {
  vi.useFakeTimers()
  const f = fixture()
  let signal: AbortSignal | undefined
  let finish!: () => void
  vi.mocked(f.strategies.response.update).mockImplementationOnce(async (_config, currentSignal) => {
    signal = currentSignal
    await new Promise<void>(resolve => {
      finish = resolve
    })
  })
  const updating = f.manager.refresh(async () => config)
  const rejection = expect(updating).rejects.toThrow(/超时/)
  await vi.advanceTimersByTimeAsync(101)
  await rejection
  expect(signal?.aborted).toBe(true)
  expect(f.strategies.redirect.dispose).toHaveBeenCalled()
  finish()
  await Promise.resolve()
  expect(f.applied.mock.calls.every(([rules]) => rules.length === 0)).toBe(true)
  await f.manager.refresh(async () => config)
  expect(f.applied).toHaveBeenLastCalledWith(
    expect.arrayContaining([expect.objectContaining({ id: 'r' })]),
    expect.any(Array)
  )
})

test('cleanup errors are included in the failure instead of being logged as successful rollback', async () => {
  const f = fixture()
  vi.mocked(f.strategies.redirect.update).mockRejectedValueOnce(new Error('apply failed'))
  vi.mocked(f.strategies.redirect.dispose).mockRejectedValueOnce(new Error('cannot remove rules'))
  await expect(f.manager.refresh(async () => config)).rejects.toThrow(
    /apply failed.*cannot remove rules/s
  )
})

test('hanging cleanup has a deadline and is reported as unconfirmed cleanup', async () => {
  vi.useFakeTimers()
  const f = fixture()
  vi.mocked(f.strategies.redirect.update).mockRejectedValueOnce(new Error('apply failed'))
  vi.mocked(f.strategies.redirect.dispose).mockImplementationOnce(() => new Promise(() => {}))
  const updating = f.manager.refresh(async () => config)
  const rejection = expect(updating).rejects.toThrow(/清理.*超时/)
  await vi.advanceTimersByTimeAsync(151)
  await rejection
})

import { expect, test } from 'vitest'
import fs from 'node:fs'
import { crxHmrCompatibility, replaceCrxLiveReload } from './crx-hmr-compat.ts'
import { requireValue } from '../../src/test-utils/fixtures'
test('all residual worker live reload placeholders respect the shared enabled/disabled option', () => {
  const source = fs.readFileSync(
    new URL('../../node_modules/@crxjs/vite-plugin/dist/index.mjs', import.meta.url),
    'utf8'
  )
  const template: string = JSON.parse(
    requireValue(source.match(/^var workerHmrClient = (".*");$/m))[1]
  )
  for (const enabled of [true, false]) {
    const partiallyReplaced = template.replace('__LIVE_RELOAD__', JSON.stringify(enabled))
    const fixed = replaceCrxLiveReload(partiallyReplaced, '/@crx/client-worker', enabled)
    expect(fixed).toBeTruthy()
    expect(requireValue(fixed).includes('__LIVE_RELOAD__')).toBe(false)
    expect(requireValue(fixed).includes(`if (${enabled})`)).toBeTruthy()
  }
})
test('the compatibility transform is dev-only, worker-only and idempotent', async () => {
  expect(replaceCrxLiveReload('__LIVE_RELOAD__', '/src/background.ts', true)).toBe(null)
  expect(replaceCrxLiveReload('if (true) {}', '/@crx/client-worker', true)).toBe(null)
  expect(replaceCrxLiveReload('__LIVE_RELOAD__', '/@crx/client-worker?t=1', false)).toBe('false')
  const plugin = crxHmrCompatibility(false)
  expect(plugin.apply).toBe('serve')
  expect(plugin.enforce).toBe('post')
  const transform = requireValue(plugin.transform)
  expect(typeof transform).toBe('function')
  if (typeof transform !== 'function') throw new Error('Expected a transform hook')
  const result = await transform.call(
    {} as ThisParameterType<typeof transform>,
    '__LIVE_RELOAD__',
    '/@crx/client-worker'
  )
  expect(result).toStrictEqual({ code: 'false', map: null })
})

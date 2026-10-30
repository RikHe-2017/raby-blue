import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { crxHmrCompatibility, replaceCrxLiveReload } from './crx-hmr-compat.ts'

test('all residual worker live reload placeholders respect the shared enabled/disabled option', () => {
  const source = fs.readFileSync(
    new URL('../../node_modules/@crxjs/vite-plugin/dist/index.mjs', import.meta.url),
    'utf8'
  )
  const template = JSON.parse(source.match(/^var workerHmrClient = (".*");$/m)[1])
  for (const enabled of [true, false]) {
    const partiallyReplaced = template.replace('__LIVE_RELOAD__', JSON.stringify(enabled))
    const fixed = replaceCrxLiveReload(partiallyReplaced, '/@crx/client-worker', enabled)
    assert.ok(fixed)
    assert.equal(fixed.includes('__LIVE_RELOAD__'), false)
    assert.ok(fixed.includes(`if (${enabled})`))
  }
})

test('the compatibility transform is dev-only, worker-only and idempotent', () => {
  assert.equal(replaceCrxLiveReload('__LIVE_RELOAD__', '/src/background.ts', true), null)
  assert.equal(replaceCrxLiveReload('if (true) {}', '/@crx/client-worker', true), null)
  assert.equal(replaceCrxLiveReload('__LIVE_RELOAD__', '/@crx/client-worker?t=1', false), 'false')
  const plugin = crxHmrCompatibility(false)
  assert.equal(plugin.apply, 'serve')
  assert.equal(plugin.enforce, 'post')
  assert.equal(plugin.transform('__LIVE_RELOAD__', '/@crx/client-worker').code, 'false')
})

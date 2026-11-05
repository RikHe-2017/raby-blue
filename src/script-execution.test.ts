import { expect, test, vi } from 'vitest'
import { executeScriptRequest, injectScript } from './script-execution'
import { createFlowLogger } from './logging/flow-logger'

test('concurrent script results have separate execution identity and no code/results in logs', async () => {
  const written: unknown[] = []
  const logs = createFlowLogger({ write: (...args) => written.push(args) })
  let sequence = 0
  const deps = {
    logs,
    readActiveTab: async () => 1,
    createExecutionId: () => String(++sequence),
    inject: async (_tabId: number, code: string) => {
      if (code === 'reject') throw Error('script rejected')
      return [{ frameId: 0, documentId: 'doc', result: undefined }]
    }
  }
  const results = await Promise.all(
    ['secret code', 'reject'].map(code =>
      executeScriptRequest({ code, scriptId: 's', scriptName: 'script' }, deps)
    )
  )
  expect(results.map(result => result.success)).toEqual([true, false])
  expect(written).toHaveLength(2)
  expect(JSON.stringify(written)).toContain('script rejected')
  expect(JSON.stringify(written)).not.toContain('secret code')
  expect(JSON.stringify(written)).not.toContain('results')
  expect(JSON.stringify(written)).toContain('executionId')
})

test('missing active tab is logged without inventing a tab and writer failures cannot affect reply', async () => {
  const written: unknown[] = []
  const logs = createFlowLogger({
    write: (...args) => {
      written.push(args)
      throw Error('storage')
    }
  })
  const result = await executeScriptRequest(
    { code: 'x', scriptId: 's', scriptName: 'script' },
    {
      logs,
      readActiveTab: async () => undefined,
      createExecutionId: () => '1',
      inject: async () => {
        throw Error('must not run')
      }
    }
  )
  expect(result).toEqual({ success: false, error: '未找到活动标签页' })
  expect(JSON.stringify(written)).not.toContain('tabId')
})

test('serialized MAIN function distinguishes throws and rejected promises from undefined success', async () => {
  const calls: chrome.scripting.ScriptInjection<string[], unknown>[] = []
  vi.stubGlobal('chrome', {
    scripting: {
      executeScript: async (options: chrome.scripting.ScriptInjection<string[], unknown>) => {
        calls.push(options)
        if (!('func' in options)) throw Error('Expected function injection')
        const func = new Function(`return (${options.func!.toString()})`)()
        return [
          {
            frameId: 0,
            documentId: 'doc',
            result: await func(...('args' in options ? (options.args ?? []) : []))
          }
        ]
      }
    }
  })
  try {
    await expect(injectScript(1, 'throw Error("user-error")')).rejects.toThrow('user-error')
    await expect(injectScript(1, 'return Promise.reject(Error("async-error"))')).rejects.toThrow(
      'async-error'
    )
    await expect(injectScript(1, 'return undefined')).resolves.toEqual([
      { frameId: 0, documentId: 'doc', result: undefined }
    ])
    await expect(injectScript(1, 'return { success: false, value: 7 }')).resolves.toEqual([
      { frameId: 0, documentId: 'doc', result: { success: false, value: 7 } }
    ])
    expect(calls.every(call => call.world === 'MAIN' && call.injectImmediately)).toBe(true)
  } finally {
    vi.unstubAllGlobals()
  }
})

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import test from 'node:test'
import * as logging from './logger.ts'

test('handled errors use normal logs and retain original Error objects and context', t => {
  assert.equal(typeof logging.logError, 'function')
  const output = t.mock.method(console, 'log', () => {})
  const errorOutput = t.mock.method(console, 'error', () => {})
  const warningOutput = t.mock.method(console, 'warn', () => {})
  const error = new Error('storage failed')
  const context = Object.freeze({ tabId: 7 })
  assert.doesNotThrow(() => logging.logError('配置保存失败:', error, context))
  assert.deepEqual(output.mock.calls[0].arguments, ['[error]:', '配置保存失败:', error, context])
  assert.equal(output.mock.calls[0].arguments[2], error)
  assert.equal(output.mock.calls[0].arguments[3], context)
  assert.equal(errorOutput.mock.callCount(), 0)
  assert.equal(warningOutput.mock.callCount(), 0)
})

test('handled warnings also use normal logs rather than extension warning entries', t => {
  assert.equal(typeof logging.logWarn, 'function')
  const output = t.mock.method(console, 'log', () => {})
  const warningOutput = t.mock.method(console, 'warn', () => {})
  const context = Object.freeze({ tabId: 7, reason: 'test detach' })
  logging.logWarn('调试连接断开:', context)
  assert.deepEqual(output.mock.calls[0].arguments, ['[warn]:', '调试连接断开:', context])
  assert.equal(warningOutput.mock.callCount(), 0)
})

test('informational logs use the shared normal-log format without transforming their values', t => {
  assert.equal(typeof logging.logInfo, 'function')
  const output = t.mock.method(console, 'log', () => {})
  const result = Object.freeze({ success: true })
  logging.logInfo('执行结果:', result)
  assert.deepEqual(output.mock.calls[0].arguments, ['[info]:', '执行结果:', result])
  assert.equal(output.mock.calls[0].arguments[2], result)
})

test('extension runtime sources do not call console.error or console.warn', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const sources = directory =>
    readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) return sources(filename)
      return /\.(?:[cm]?js|ts|vue)$/.test(entry.name) ? [filename] : []
    })
  const violations = sources(path.join(root, 'src'))
    .filter(filename => /console\s*\.\s*(?:error|warn)\s*\(/.test(readFileSync(filename, 'utf8')))
    .map(filename => path.relative(root, filename))
  assert.deepEqual(violations, [])
})

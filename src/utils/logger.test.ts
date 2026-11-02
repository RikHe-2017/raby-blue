import { expect, test, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import * as logging from './logger.ts'
test('handled errors use normal logs and retain original Error objects and context', () => {
  expect(typeof logging.logError).toBe('function')
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const errorOutput = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warningOutput = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const error = new Error('storage failed')
  const context = Object.freeze({ tabId: 7 })
  expect(() => logging.logError('配置保存失败:', error, context)).not.toThrow()
  expect(output.mock.calls[0]).toStrictEqual(['[error]:', '配置保存失败:', error, context])
  expect(output.mock.calls[0][2]).toBe(error)
  expect(output.mock.calls[0][3]).toBe(context)
  expect(errorOutput.mock.calls.length).toBe(0)
  expect(warningOutput.mock.calls.length).toBe(0)
})
test('handled warnings also use normal logs rather than extension warning entries', () => {
  expect(typeof logging.logWarn).toBe('function')
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const warningOutput = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const context = Object.freeze({ tabId: 7, reason: 'test detach' })
  logging.logWarn('调试连接断开:', context)
  expect(output.mock.calls[0]).toStrictEqual(['[warn]:', '调试连接断开:', context])
  expect(warningOutput.mock.calls.length).toBe(0)
})
test('informational logs use the shared normal-log format without transforming their values', () => {
  expect(typeof logging.logInfo).toBe('function')
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const result = Object.freeze({ success: true })
  logging.logInfo('执行结果:', result)
  expect(output.mock.calls[0]).toStrictEqual(['[info]:', '执行结果:', result])
  expect(output.mock.calls[0][2]).toBe(result)
})
test('extension runtime sources do not call console.error or console.warn', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const sources = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) return sources(filename)
      return /\.(?:[cm]?js|ts|vue)$/.test(entry.name) ? [filename] : []
    })
  const violations = sources(path.join(root, 'src'))
    .filter(filename => /console\s*\.\s*(?:error|warn)\s*\(/.test(readFileSync(filename, 'utf8')))
    .map(filename => path.relative(root, filename))
  expect(violations).toStrictEqual([])
})

import { expect, test } from 'vitest'
import {
  debuggerErrorMessage,
  isEndedInterception,
  isMissingDebuggerMethod,
  isUnavailableDebugTarget
} from './debugger-errors.ts'
test('protocol errors and Chrome errors are parsed without broad suppression of invalid parameters', () => {
  expect(
    debuggerErrorMessage(new Error('{"code":-32602,"message":"Invalid InterceptionId."}'))
  ).toBe('Invalid InterceptionId.')
  expect(debuggerErrorMessage({ message: 'Target closed' })).toBe('Target closed')
  for (const message of [
    'Invalid InterceptionId.',
    'Session with given id not found',
    'Debugger is not attached to the tab with id: 1',
    'Target closed'
  ])
    expect(isEndedInterception(new Error(message)), message).toBe(true)
  for (const message of [
    'Invalid parameters',
    'Invalid header name',
    'Invalid header value: Invalid InterceptionId.'
  ])
    expect(isEndedInterception(new Error(message)), message).toBe(false)
  expect(isMissingDebuggerMethod(new Error("'Fetch.enable' wasn't found"), 'Fetch.enable')).toBe(
    true
  )
  expect(isMissingDebuggerMethod(new Error("'Network.enable' wasn't found"), 'Fetch.enable')).toBe(
    false
  )
  expect(isUnavailableDebugTarget(new Error('Cannot access a chrome:// URL'))).toBe(true)
  expect(isUnavailableDebugTarget(new Error('Another debugger is already attached'))).toBe(false)
})

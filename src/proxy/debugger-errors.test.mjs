import assert from 'node:assert/strict'
import test from 'node:test'
import {
  debuggerErrorMessage,
  isEndedInterception,
  isMissingDebuggerMethod,
  isUnavailableDebugTarget
} from './debugger-errors.ts'

test('protocol errors and Chrome errors are parsed without broad suppression of invalid parameters', () => {
  assert.equal(
    debuggerErrorMessage(new Error('{"code":-32602,"message":"Invalid InterceptionId."}')),
    'Invalid InterceptionId.'
  )
  assert.equal(debuggerErrorMessage({ message: 'Target closed' }), 'Target closed')
  for (const message of [
    'Invalid InterceptionId.',
    'Session with given id not found',
    'Debugger is not attached to the tab with id: 1',
    'Target closed'
  ])
    assert.equal(isEndedInterception(new Error(message)), true, message)
  for (const message of [
    'Invalid parameters',
    'Invalid header name',
    'Invalid header value: Invalid InterceptionId.'
  ])
    assert.equal(isEndedInterception(new Error(message)), false, message)
  assert.equal(
    isMissingDebuggerMethod(new Error("'Fetch.enable' wasn't found"), 'Fetch.enable'),
    true
  )
  assert.equal(
    isMissingDebuggerMethod(new Error("'Network.enable' wasn't found"), 'Fetch.enable'),
    false
  )
  assert.equal(isUnavailableDebugTarget(new Error('Cannot access a chrome:// URL')), true)
  assert.equal(isUnavailableDebugTarget(new Error('Another debugger is already attached')), false)
})

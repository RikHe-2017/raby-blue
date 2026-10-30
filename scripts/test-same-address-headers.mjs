import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const received = []
const source = http.createServer((request, response) => {
  let body = ''
  request.on('data', chunk => {
    body += chunk
  })
  request.on('end', () => {
    received.push({ url: request.url, headers: request.headers, body })
    response.setHeader('X-Reply', 'original')
    response.setHeader('Cache-Control', 'no-store')
    if (request.url === '/' || request.url === '/api/page') {
      response.setHeader('Content-Type', 'text/html')
      response.end('<h1>NATIVE DOCUMENT</h1>')
    } else if (request.url === '/api/escape') {
      response.writeHead(302, { Location: '/outside' })
      response.end()
    } else {
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          method: request.method,
          body,
          label: request.headers['x-label'],
          original: request.headers['x-original'],
          cookie: request.headers.cookie
        })
      )
    }
  })
})
const destinationRequests = []
const destination = http.createServer((request, response) => {
  destinationRequests.push(request.url)
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.end('UNEXPECTED REDIRECT')
})
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'raby-same-address-'))
let context
try {
  await new Promise(resolve => source.listen(0, '127.0.0.1', resolve))
  await new Promise(resolve => destination.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${source.address().port}`
  context = await chromium.launchPersistentContext(profile, {
    executablePath:
      process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging']
  })
  const browser = await context.browser().newBrowserCDPSession()
  await browser.send('Extensions.loadUnpacked', { path: path.resolve('dist') })
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const logs = []
  worker.on('console', message => logs.push(message.text()))
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  await context.addCookies([{ name: 'session', value: 'retained', url: origin }])
  await page.goto(origin)
  const headerRule = {
    id: 'headers',
    name: 'headers only',
    type: 'rule',
    groupId: 'g',
    enabled: true,
    sourceUrl: `${origin}/api/`,
    targetUrl: process.env.HEADER_TARGET ?? `${origin}/api/`,
    requestHeaders: [{ id: 'request', enabled: true, name: 'X-Label', value: 'xianghe11' }],
    responseHeaders: [{ id: 'response', enabled: true, name: 'X-Reply', value: 'changed' }]
  }
  const config = {
    enabled: true,
    groups: [
      {
        id: 'g',
        name: 'test',
        enabled: true,
        type: 'group',
        children: [
          headerRule,
          {
            id: 'fallback',
            name: 'lower priority redirect',
            type: 'rule',
            groupId: 'g',
            enabled: true,
            sourceUrl: headerRule.sourceUrl,
            targetUrl: `http://127.0.0.1:${destination.address().port}/`
          }
        ]
      }
    ]
  }
  const save = value =>
    worker.evaluate(value => chrome.storage.local.set({ proxyConfig: value }), value)
  const until = async predicate => {
    for (let i = 0; i < 100; i++) {
      if (await predicate()) return
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error(`Configuration timed out: ${logs.join('\n')}`)
  }
  await save(config)
  await until(() =>
    worker.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length === 2)
  )
  const xhr = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = new XMLHttpRequest()
        request.open('POST', '/api/list?q=1')
        request.setRequestHeader('X-Original', 'retained')
        request.onload = () =>
          resolve({
            url: request.responseURL,
            reply: request.getResponseHeader('X-Reply'),
            body: JSON.parse(request.responseText)
          })
        request.onerror = () => reject(new Error('XHR failed'))
        request.send('payload=unchanged')
      })
  )
  assert.equal(xhr.body.label, 'xianghe11', 'same-address XHR must send configured request headers')
  assert.equal(xhr.reply, 'changed')
  assert.equal(xhr.url, `${origin}/api/list?q=1`)
  assert.equal(xhr.body.body, 'payload=unchanged')
  assert.equal(xhr.body.method, 'POST')
  assert.equal(xhr.body.original, 'retained')
  assert.equal(xhr.body.cookie, 'session=retained')
  const batch = await page.evaluate(async () =>
    Promise.all(
      Array.from(
        { length: 120 },
        (_, index) =>
          new Promise((resolve, reject) => {
            const request = new XMLHttpRequest()
            request.open('POST', `/api/save?index=${index}`)
            request.setRequestHeader('Content-Type', 'application/json')
            request.setRequestHeader('Authorization', 'fixture-token')
            request.onload = () =>
              resolve({
                reply: request.getResponseHeader('X-Reply'),
                ...JSON.parse(request.responseText)
              })
            request.onerror = () => reject(new Error('Local concurrent XHR failed'))
            request.send(JSON.stringify({ index, content: 'x'.repeat(index * 100) }))
          })
      )
    )
  )
  assert.equal(
    batch.filter(item => item.label === 'xianghe11').length,
    120,
    'every concurrent JSON POST must include X-Label'
  )
  assert.equal(
    batch.filter(item => item.reply === 'changed').length,
    120,
    'every response must use its bound rule'
  )
  for (const [index, item] of batch.entries()) {
    assert.deepEqual(JSON.parse(item.body), { index, content: 'x'.repeat(index * 100) })
    assert.equal(item.method, 'POST')
    assert.equal(item.cookie, 'session=retained')
  }
  console.log(
    'PASS: 120 concurrent JSON POSTs retain headers, response overrides, bodies and cookies'
  )
  const fetched = await page.evaluate(async () => {
    const response = await fetch('/api/fetch')
    return {
      url: response.url,
      redirected: response.redirected,
      reply: response.headers.get('X-Reply'),
      body: await response.json()
    }
  })
  assert.equal(fetched.body.label, 'xianghe11')
  assert.equal(fetched.redirected, false)
  assert.equal(fetched.reply, 'changed')
  assert.equal(fetched.url, `${origin}/api/fetch`)
  const outside = await page.evaluate(async () => {
    const response = await fetch('/api-extra/list')
    return { reply: response.headers.get('X-Reply'), body: await response.json() }
  })
  assert.equal(outside.body.label, undefined)
  assert.equal(outside.reply, 'original')
  const escaped = await page.evaluate(async () => (await fetch('/api/escape')).json())
  assert.equal(escaped.label, undefined)
  const doc = await page.goto(`${origin}/api/page`)
  assert.equal(page.url(), `${origin}/api/page`)
  assert.equal(doc.headers()['x-reply'], 'changed')
  assert.equal(await page.locator('h1').textContent(), 'NATIVE DOCUMENT')
  assert.equal(
    received.find(request => request.url === '/api/page').headers['x-label'],
    'xianghe11'
  )
  assert.deepEqual(
    destinationRequests,
    [],
    'header-only rules must not fall through to lower priority redirects'
  )
  const disabledRows = structuredClone(config)
  disabledRows.groups[0].children[0].requestHeaders[0].enabled = false
  disabledRows.groups[0].children[0].responseHeaders[0].enabled = false
  await save(disabledRows)
  await until(() =>
    page.evaluate(async () => {
      const response = await fetch('/api/disabled')
      return (
        response.headers.get('X-Reply') === 'original' &&
        (await response.json()).label === undefined
      )
    })
  )
  await save({ ...config, enabled: false })
  await until(() =>
    worker.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length === 0)
  )
  const disabled = await page.evaluate(async () => (await fetch('/api/off')).json())
  assert.equal(disabled.label, undefined)
  console.log(
    'PASS: same-address XHR/Fetch/document headers, native URLs/bodies/cookies, path isolation, redirect isolation, precedence and disabling'
  )
} finally {
  await context?.close()
  source.closeAllConnections()
  destination.closeAllConnections()
  await Promise.all([
    new Promise(resolve => source.close(resolve)),
    new Promise(resolve => destination.close(resolve))
  ])
  await fs.rm(profile, { recursive: true, force: true })
}

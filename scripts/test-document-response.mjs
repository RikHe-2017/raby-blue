import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const requests = []
const listen = async handler => {
  const server = http.createServer(handler)
  await new Promise(resolve => server.listen(0, '0.0.0.0', resolve))
  return server
}
const source = await listen((req, res) => {
  requests.push(['source', req.url, req.headers])
  if (req.url.startsWith('/external')) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({ token: req.headers.authorization, proxy: req.headers['x-proxy-test'] })
    )
    return
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end('<h1>ORIGINAL DOCUMENT</h1>')
})
const sourceOrigin = `http://127.0.0.1:${source.address().port}`
const frameOrigin = `http://127.0.0.2:${source.address().port}`
const target = await listen((req, res) => {
  requests.push(['target', req.url, req.headers])
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('X-Reply', 'original')
  res.setHeader('Access-Control-Expose-Headers', 'X-Reply')
  if (req.url === '/document-escape') {
    res.writeHead(302, { Location: `${targetOrigin}/external?document` })
    res.end()
  } else if (req.url === '/escape-cross') {
    res.writeHead(302, {
      Location: `${sourceOrigin}/external?cross`
    })
    res.end()
  } else if (req.url === '/escape') {
    res.writeHead(302, { Location: `${targetOrigin}/external` })
    res.end()
  } else if (req.url.startsWith('/external')) {
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({ token: req.headers.authorization, proxy: req.headers['x-proxy-test'] })
    )
  } else if (req.url.startsWith('/main.js')) {
    res.setHeader('Content-Type', 'text/javascript')
    res.end('window.localScriptLoaded = true')
  } else if (req.url.startsWith('/worker.js')) {
    res.setHeader('Content-Type', 'text/javascript')
    res.end("self.onmessage = async () => self.postMessage(await (await fetch('/app/api')).json())")
  } else if (req.url.startsWith('/style.css')) {
    res.setHeader('Content-Type', 'text/css')
    res.end('h1 { color: rgb(12, 34, 56) }')
  } else if (req.url.startsWith('/binary')) {
    res.setHeader('Content-Type', 'application/octet-stream')
    res.end(Buffer.from([0, 128, 255, 7]))
  } else if (req.url.startsWith('/upload')) {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify([...Buffer.concat(chunks)]))
    })
  } else if (req.url.startsWith('/api')) {
    let body = ''
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ method: req.method, body, token: req.headers.authorization }))
    })
  } else if (req.url.startsWith('/plain')) {
    res.setHeader('Content-Type', 'text/plain')
    res.end('LOCAL NON HTML DOCUMENT')
  } else if (req.url.startsWith('/post')) {
    let body = ''
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', () => {
      res.setHeader('Content-Type', 'text/html')
      res.end(`<h1>POST ${body}</h1>`)
    })
  } else if (req.url.startsWith('/frame/')) {
    res.setHeader('Content-Type', 'text/html')
    res.end('<h1>LOCAL IFRAME</h1>')
  } else {
    const body = `<meta charset="utf-8"><h1>LOCAL DOCUMENT 中文</h1><script src="/app/main.js"></script><link rel="stylesheet" href="/app/style.css"><iframe src="${frameOrigin}/frame/page"></iframe>`
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Encoding', 'gzip')
    res.end(gzipSync(body))
  }
})
const targetOrigin = `http://127.0.0.1:${target.address().port}`
const unrelated = await listen((_req, res) => {
  res.setHeader('Content-Type', 'text/html')
  res.end('<h1>Unrelated origin</h1>')
})
const unrelatedOrigin = `http://127.0.0.1:${unrelated.address().port}`
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'raby-document-response-'))
let context
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath:
      process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: process.env.OPEN_DEVTOOLS !== '1',
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      '--enable-unsafe-extension-debugging',
      '--site-per-process',
      ...(process.env.OPEN_DEVTOOLS === '1' ? ['--auto-open-devtools-for-tabs'] : [])
    ],
    viewport: { width: 1100, height: 800 }
  })
  const cdp = await context.browser().newBrowserCDPSession()
  await cdp.send('Browser.grantPermissions', {
    permissions: ['localNetworkAccess', 'localNetwork', 'loopbackNetwork']
  })
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: path.resolve('dist') })
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const logs = []
  worker.on('console', message => logs.push(message.text()))
  const page = await context.newPage()
  page.on('console', message => {
    if (message.type() === 'error') console.log('PAGE:', message.text())
  })
  page.on('requestfailed', request => console.log('FAILED:', request.url(), request.failure()))
  page.setDefaultTimeout(10000)
  const originalUrl = `${sourceOrigin}/app/`
  await page.goto(originalUrl)
  const config = {
    enabled: true,
    groups: [
      {
        id: 'g',
        name: 'test',
        type: 'group',
        enabled: false,
        children: [
          {
            id: 'r',
            name: 'main',
            type: 'rule',
            groupId: 'g',
            enabled: true,
            sourceUrl: `${sourceOrigin}/app/`,
            targetUrl: `${targetOrigin}/`,
            requestHeaders: [
              { id: 'h1', enabled: true, name: 'X-Proxy-Test', value: 'main' },
              { id: 'auth', enabled: true, name: 'Authorization', value: 'Bearer fixture' },
              { id: 'blank', enabled: true, name: 'X-Blank', value: '' },
              { id: 'off', enabled: false, name: 'X-Disabled', value: 'must-not-send' }
            ],
            responseHeaders: [
              { id: 'h2', enabled: true, name: 'X-Reply', value: 'replaced' },
              { id: 'h3', enabled: true, name: 'Access-Control-Expose-Headers', value: 'X-Reply' }
            ]
          },
          {
            id: 'alternate',
            name: 'alternate',
            type: 'rule',
            groupId: 'g',
            enabled: true,
            sourceUrl: `${sourceOrigin}/alternate/`,
            targetUrl: `${targetOrigin}/`,
            requestHeaders: [{ id: 'a1', enabled: true, name: 'X-Proxy-Test', value: 'alternate' }],
            responseHeaders: [
              { id: 'a2', enabled: true, name: 'X-Reply', value: 'alternate' },
              { id: 'a3', enabled: true, name: 'Access-Control-Expose-Headers', value: 'X-Reply' }
            ]
          },
          {
            id: 'f',
            name: 'iframe',
            type: 'rule',
            groupId: 'g',
            enabled: true,
            sourceUrl: `${frameOrigin}/frame/`,
            targetUrl: `${targetOrigin}/frame/`
          }
        ]
      }
    ]
  }
  const save = value =>
    worker.evaluate(config => chrome.storage.local.set({ proxyConfig: config }), value)
  const waitUntil = async predicate => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await predicate()) return
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    const diagnostics = await worker.evaluate(async () =>
      Promise.all(
        (await chrome.tabs.query({})).map(async tab => ({
          url: tab.url,
          badge: await chrome.action.getBadgeText({ tabId: tab.id }),
          title: await chrome.action.getTitle({ tabId: tab.id })
        }))
      )
    )
    throw new Error(
      `Timed out. Diagnostics: ${JSON.stringify(diagnostics)}. Worker logs: ${logs.join('\n')}`
    )
  }
  const attached = () =>
    worker.evaluate(async origin => {
      const tab = (await chrome.tabs.query({})).find(tab => tab.url?.startsWith(origin))
      if (!tab) return false
      try {
        await chrome.debugger.sendCommand({ tabId: tab.id }, 'Page.getFrameTree')
        return true
      } catch {
        return false
      }
    }, sourceOrigin)
  await save(config)
  await waitUntil(attached)
  await new Promise(resolve => setTimeout(resolve, 300))
  const before = requests.filter(([host, url]) => host === 'source' && url === '/app/').length
  const redirected = []
  page.on('request', request => {
    if (request.redirectedFrom()) redirected.push(request.url())
  })
  const documentResponse = await page.reload()
  console.log('CHECK: document loaded')
  assert.equal(documentResponse.headers()['x-reply'], 'replaced')
  assert.equal(page.url(), originalUrl)
  assert.equal(await page.locator('h1').textContent(), 'LOCAL DOCUMENT 中文')
  await page
    .waitForFunction(() => window.localScriptLoaded === true)
    .catch(error => {
      console.log('REQUESTS:', requests, 'REDIRECTS:', redirected, 'WORKER:', logs)
      throw error
    })
  assert.equal(
    await page.locator('h1').evaluate(el => getComputedStyle(el).color),
    'rgb(12, 34, 56)'
  )
  await waitUntil(async () => {
    const frame = page.frames().find(frame => frame.url() === `${frameOrigin}/frame/page`)
    return frame && (await frame.locator('h1').textContent()) === 'LOCAL IFRAME'
  })
  assert.equal(
    requests.filter(([host, url]) => host === 'source' && url === '/app/').length,
    before
  )
  assert.ok(redirected.includes(`${targetOrigin}/main.js`))
  assert.ok(redirected.includes(`${targetOrigin}/style.css`))
  assert.ok(requests.some(([host, url]) => host === 'target' && url === '/main.js'))
  assert.ok(requests.some(([host, url]) => host === 'target' && url === '/style.css'))
  console.log('CHECK: resources loaded')
  assert.equal(
    requests.find(([host, url]) => host === 'target' && url === '/main.js')[2]['x-proxy-test'],
    'main'
  )
  const redirectRules = await worker.evaluate(async () =>
    chrome.declarativeNetRequest.getDynamicRules()
  )
  assert.equal(redirectRules.length, 3)
  console.log('CHECK: proxy rules loaded')
  assert.ok(
    redirectRules.every(
      rule =>
        !rule.condition.resourceTypes.includes('main_frame') &&
        !rule.condition.resourceTypes.includes('sub_frame')
    )
  )
  const api = await page.evaluate(async () => {
    const response = await fetch('/app/api', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{"hello":"world"}'
    })
    return {
      url: response.url,
      redirected: response.redirected,
      reply: response.headers.get('X-Reply'),
      body: await response.json()
    }
  })
  assert.equal(api.url, `${targetOrigin}/api`)
  assert.equal(api.redirected, true)
  assert.equal(api.reply, 'replaced')
  console.log('CHECK: first API loaded')
  assert.equal(
    requests.find(([host, url]) => host === 'target' && url === '/api')[2]['x-proxy-test'],
    'main'
  )
  assert.equal(
    requests.find(([host, url]) => host === 'target' && url === '/api')[2]['x-blank'],
    ''
  )
  await page.evaluate(async url => (await fetch(url)).text(), `${targetOrigin}/api?direct`)
  assert.equal(
    requests.find(([host, url]) => host === 'target' && url === '/api?direct')[2]['x-proxy-test'],
    undefined
  )
  const unrelatedPage = await context.newPage()
  await unrelatedPage.goto(unrelatedOrigin)
  const unrelatedReply = await unrelatedPage.evaluate(async url => {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    return { reply: response.headers.get('X-Reply'), body: await response.json() }
  }, `${targetOrigin}/api?unrelated`)
  assert.equal(unrelatedReply.reply, 'original')
  assert.equal(unrelatedReply.body.token, undefined)
  assert.equal(
    requests.find(([host, url]) => host === 'target' && url === '/api?unrelated')[2][
      'x-proxy-test'
    ],
    undefined
  )
  await unrelatedPage.close()
  assert.deepEqual(api.body, { method: 'POST', body: '{"hello":"world"}', token: 'Bearer fixture' })
  assert.equal(
    requests.find(([host, url]) => host === 'target' && url === '/api')[2]['x-disabled'],
    undefined
  )
  const alternate = await page.evaluate(async () => {
    const response = await fetch('/alternate/api?alternate')
    return { reply: response.headers.get('X-Reply'), body: await response.json() }
  })
  assert.equal(alternate.reply, 'alternate')
  console.log('CHECK: alternate API loaded')
  assert.equal(
    requests.find(([host, url]) => host === 'target' && url === '/api?alternate')[2][
      'x-proxy-test'
    ],
    'alternate'
  )
  const batch = await page.evaluate(async () =>
    Promise.all(
      Array.from({ length: 120 }, async (_, index) => {
        const prefix = index % 2 ? '/alternate/' : '/app/'
        const response = await fetch(`${prefix}api?batch=${index}`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ index, text: 'fixture' })
        })
        return {
          url: response.url,
          redirected: response.redirected,
          reply: response.headers.get('X-Reply'),
          body: await response.json()
        }
      })
    )
  )
  for (const [index, item] of batch.entries()) {
    assert.equal(item.url, `${targetOrigin}/api?batch=${index}`)
    assert.equal(item.redirected, true, 'resources must retain native redirect behavior')
    assert.equal(item.reply, index % 2 ? 'alternate' : 'replaced')
    assert.equal(item.body.method, 'POST')
    assert.equal(item.body.body, JSON.stringify({ index, text: 'fixture' }))
    assert.equal(item.body.token, index % 2 ? undefined : 'Bearer fixture')
    assert.equal(
      requests.find(([host, url]) => host === 'target' && url === `/api?batch=${index}`)[2][
        'x-proxy-test'
      ],
      index % 2 ? 'alternate' : 'main'
    )
  }
  console.log(
    'PASS: 120 concurrent mapped POSTs keep source-specific headers while sharing one target'
  )
  const escaped = await page.evaluate(async () => (await fetch('/app/escape')).json())
  console.log('CHECK: downstream redirect loaded')
  assert.deepEqual(
    escaped,
    {},
    'configured credentials and custom headers must not leak downstream'
  )
  const binary = await page.evaluate(async () => [
    ...new Uint8Array(await (await fetch('/app/binary')).arrayBuffer())
  ])
  assert.deepEqual(binary, [0, 128, 255, 7])
  const uploaded = await page.evaluate(async () =>
    (
      await fetch('/app/upload', {
        method: 'POST',
        body: new Uint8Array([0, 128, 255, 7])
      })
    ).json()
  )
  assert.deepEqual(uploaded, [0, 128, 255, 7])
  const xhr = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = new XMLHttpRequest()
        request.open('GET', '/app/api')
        request.onload = () =>
          resolve({ url: request.responseURL, body: JSON.parse(request.responseText) })
        request.onerror = reject
        request.send()
      })
  )
  assert.equal(xhr.url, `${targetOrigin}/api`)
  assert.equal(xhr.body.method, 'GET')
  console.log(
    'PASS: documents/iframes use replacement; JS/CSS/binary/Fetch/XHR use redirects with disjoint scopes'
  )

  await page.goto(`${sourceOrigin}/app/plain`)
  assert.equal(page.url(), `${sourceOrigin}/app/plain`)
  assert.ok((await page.locator('body').innerText()).includes('LOCAL NON HTML DOCUMENT'))
  console.log('PASS: document replacement does not inspect MIME')

  await page.evaluate(url => {
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = url
    const input = document.createElement('input')
    input.name = 'message'
    input.value = 'hello'
    form.append(input)
    document.body.append(form)
    form.submit()
  }, `${sourceOrigin}/app/post`)
  await page.waitForURL(`${sourceOrigin}/app/post`)
  await page.getByRole('heading', { name: 'POST message=hello' }).waitFor()
  console.log('PASS: document POST preserves method and body')
  const errorDocumentLoaded = page.waitForEvent('domcontentloaded')
  await page.goto(`${sourceOrigin}/app/document-escape`).catch(() => {})
  await errorDocumentLoaded
  assert.equal(
    requests.some(([host, url]) => host === 'target' && url === '/external?document'),
    false,
    'replacement must not follow a secondary redirect with configured request headers'
  )
  await waitUntil(() =>
    worker.evaluate(async origin => {
      const tab = (await chrome.tabs.query({})).find(tab => tab.url?.startsWith(origin))
      return tab && (await chrome.action.getBadgeText({ tabId: tab.id })) === '!'
    }, sourceOrigin)
  )

  await page.goto(`${sourceOrigin}/unmatched`)
  assert.equal(await page.locator('h1').textContent(), 'ORIGINAL DOCUMENT')
  await waitUntil(attached)
  const escapedCross = await page.evaluate(async () =>
    (await fetch('/app/escape-cross', { signal: AbortSignal.timeout(5000) })).json()
  )
  assert.deepEqual(
    escapedCross,
    {},
    'third-party redirects must not inherit configured credentials or custom headers'
  )
  const apiOnly = await page.evaluate(
    async url => (await fetch(url)).json(),
    `${sourceOrigin}/app/api`
  )
  assert.equal(
    apiOnly.method,
    'GET',
    'API-only pages must remain attached even when page URL does not match'
  )
  await page.goto(originalUrl)
  await waitUntil(attached)
  await new Promise(resolve => setTimeout(resolve, 300))
  await page.reload()
  assert.equal(await page.locator('h1').textContent(), 'LOCAL DOCUMENT 中文')
  console.log('PASS: unmatched navigation is unchanged and API-only rules still work')

  const overlapping = structuredClone(config)
  overlapping.groups[0].children.push({
    id: 'direct-target',
    name: 'direct target source rule',
    type: 'rule',
    groupId: 'g',
    enabled: true,
    sourceUrl: `${targetOrigin}/`,
    targetUrl: '',
    requestHeaders: [{ id: 'direct-req', enabled: true, name: 'X-Proxy-Test', value: 'direct' }],
    responseHeaders: [
      { id: 'direct-res', enabled: true, name: 'X-Reply', value: 'direct' },
      {
        id: 'direct-expose',
        enabled: true,
        name: 'Access-Control-Expose-Headers',
        value: 'X-Reply'
      }
    ]
  })
  await save(overlapping)
  await waitUntil(() =>
    page.evaluate(
      async url => (await fetch(url)).headers.get('X-Reply') === 'direct',
      `${targetOrigin}/api?ready`
    )
  )
  const mixed = await page.evaluate(
    async targetOrigin =>
      Promise.all(
        Array.from({ length: 60 }, async (_, index) => {
          const direct = index % 3 === 2
          const prefix = direct ? `${targetOrigin}/` : index % 3 ? '/alternate/' : '/app/'
          const response = await fetch(`${prefix}api?mixed=${index}`)
          return { redirected: response.redirected, reply: response.headers.get('X-Reply') }
        })
      ),
    targetOrigin
  )
  for (const [index, item] of mixed.entries()) {
    const expected = ['main', 'alternate', 'direct'][index % 3]
    assert.equal(item.redirected, expected !== 'direct')
    assert.equal(item.reply, expected === 'main' ? 'replaced' : expected)
    assert.equal(
      requests.find(([host, url]) => host === 'target' && url === `/api?mixed=${index}`)[2][
        'x-proxy-test'
      ],
      expected
    )
  }
  console.log(
    'PASS: mapped targets retain source ownership even when the target has its own source rule'
  )

  const withoutHeaders = structuredClone(config)
  for (const group of withoutHeaders.groups)
    for (const rule of group.children) {
      delete rule.requestHeaders
      delete rule.responseHeaders
    }
  await save(withoutHeaders)
  await waitUntil(async () =>
    page.evaluate(async () => {
      const response = await fetch('/app/api?cleared')
      const body = await response.json()
      return response.headers.get('X-Reply') === 'original' && body.token === undefined
    })
  )
  assert.equal(
    requests.filter(([host, url]) => host === 'target' && url === '/api?cleared').at(-1)[2][
      'x-proxy-test'
    ],
    undefined
  )
  await page.goto(`${sourceOrigin}/app/document-escape`)
  assert.ok(requests.some(([host, url]) => host === 'target' && url === '/external?document'))
  console.log(
    'PASS: deleting header overrides restores original headers and document redirect-follow behavior'
  )

  await save({ ...config, enabled: false })
  await waitUntil(async () => !(await attached()))
  await waitUntil(() =>
    worker.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length === 0)
  )
  await page.goto(originalUrl)
  assert.equal(await page.locator('h1').textContent(), 'ORIGINAL DOCUMENT')
  console.log('PASS: disabling clears redirects and detaches debugger')

  await save(config)
  await waitUntil(attached)
  await new Promise(resolve => setTimeout(resolve, 300))
  await new Promise(resolve => target.close(resolve))
  await page.reload().catch(() => {})
  await waitUntil(() =>
    worker.evaluate(async url => {
      const tab = (await chrome.tabs.query({})).find(tab => tab.url?.startsWith(url))
      return tab && (await chrome.action.getBadgeText({ tabId: tab.id })) === '!'
    }, sourceOrigin)
  )
  console.log('PASS: unreachable target fails visibly without silent remote fallback')
  console.log(`Extension under test: ${id}`)
} catch (error) {
  console.error('INTEGRATION ERROR:', error, 'REQUESTS:', JSON.stringify(requests))
  throw error
} finally {
  await context?.close()
  source.closeAllConnections()
  target.closeAllConnections()
  unrelated.closeAllConnections()
  await new Promise(resolve => unrelated.close(resolve))
  await new Promise(resolve => source.close(resolve))
  if (target.listening) await new Promise(resolve => target.close(resolve))
  await fs.rm(profile, { recursive: true, force: true })
}

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
  requests.push(['source', req.url])
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end('<h1>ORIGINAL DOCUMENT</h1>')
})
const sourceOrigin = `http://127.0.0.1:${source.address().port}`
const frameOrigin = `http://127.0.0.2:${source.address().port}`
const target = await listen((req, res) => {
  requests.push(['target', req.url])
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.url.startsWith('/main.js')) {
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
    origin: sourceOrigin,
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
            targetUrl: `${targetOrigin}/`
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
  await page.reload()
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
  const redirectRules = await worker.evaluate(async () =>
    chrome.declarativeNetRequest.getDynamicRules()
  )
  assert.equal(redirectRules.length, 2)
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
    return { url: response.url, redirected: response.redirected, body: await response.json() }
  })
  assert.equal(api.url, `${targetOrigin}/api`)
  assert.equal(api.redirected, true)
  assert.deepEqual(api.body, { method: 'POST', body: '{"hello":"world"}' })
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

  await page.goto(`${sourceOrigin}/unmatched`)
  assert.equal(await page.locator('h1').textContent(), 'ORIGINAL DOCUMENT')
  await waitUntil(attached)
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
} finally {
  await context?.close()
  source.closeAllConnections()
  target.closeAllConnections()
  await new Promise(resolve => source.close(resolve))
  if (target.listening) await new Promise(resolve => target.close(resolve))
  await fs.rm(profile, { recursive: true, force: true })
}

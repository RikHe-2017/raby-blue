import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const address = Object.values(os.networkInterfaces())
  .flat()
  .find(item => item.family === 'IPv4' && !item.internal)?.address
assert.ok(address, 'A LAN interface is required to reproduce an insecure LAN document')
const source = http.createServer((_request, response) => response.end('ORIGINAL'))
const received = []
const target = http.createServer((request, response) => {
  received.push({ url: request.url, headers: request.headers })
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('X-Reply', 'original')
  if (request.url === '/main.js') {
    response.setHeader('Content-Type', 'text/javascript')
    response.end('window.scriptLoaded = true')
  } else if (request.url === '/api') {
    response.setHeader('Content-Type', 'application/json')
    response.end('{"local":true}')
  } else {
    response.setHeader('Content-Type', 'text/html')
    response.end(`<h1>LOCAL</h1><script src="/app/main.js"></script>
      <script>fetch('/app/api').then(r => r.json()).then(data => window.fetchLoaded = data.local)</script>`)
  }
})
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'raby-url-rewrite-'))
let context
try {
  await new Promise(resolve => source.listen(0, '0.0.0.0', resolve))
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve))
  const sourceOrigin = `http://${address}:${source.address().port}`
  const targetOrigin = `http://127.0.0.1:${target.address().port}`
  // No secure-origin exceptions or local-network permission grants.
  context = await chromium.launchPersistentContext(profile, {
    executablePath:
      process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging']
  })
  const cdp = await context.browser().newBrowserCDPSession()
  await cdp.send('Extensions.loadUnpacked', { path: path.resolve('dist') })
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  worker.on('console', message => console.log('BACKGROUND:', message.text()))
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  const failed = []
  page.on('requestfailed', request =>
    failed.push({ url: request.url(), failure: request.failure() })
  )
  await page.goto(`${sourceOrigin}/app/`)
  for (const withHeaders of [false, true]) {
    const rule = {
      id: 'document',
      name: 'document',
      type: 'rule',
      groupId: 'g',
      enabled: true,
      sourceUrl: `${sourceOrigin}/app/`,
      targetUrl: `${targetOrigin}/`,
      ...(withHeaders
        ? {
            requestHeaders: [{ id: 'req', enabled: true, name: 'X-Test', value: 'configured' }],
            responseHeaders: [{ id: 'res', enabled: true, name: 'X-Reply', value: 'configured' }]
          }
        : {})
    }
    await worker.evaluate(
      rule =>
        chrome.storage.local.set({
          proxyConfig: {
            enabled: true,
            groups: [{ id: 'g', name: 'test', type: 'group', children: [rule] }]
          }
        }),
      rule
    )
    await page.waitForTimeout(500)
    const response = await page.reload()
    await page.waitForFunction(() => window.scriptLoaded && window.fetchLoaded)
    assert.equal(page.url(), `${sourceOrigin}/app/`)
    assert.equal(await page.evaluate(() => window.isSecureContext), false)
    assert.equal(
      received.filter(item => item.url === '/').at(-1).headers['x-test'],
      withHeaders ? 'configured' : undefined
    )
    assert.equal(response.headers()['x-reply'], withHeaders ? 'configured' : 'original')
    assert.deepEqual(failed, [])
    console.log(
      `PASS: insecure LAN document retains original URL; local script/Fetch load; header overrides ${withHeaders ? 'enabled' : 'disabled'}`
    )
  }
} finally {
  await context?.close()
  source.closeAllConnections()
  target.closeAllConnections()
  await new Promise(resolve => source.close(resolve))
  await new Promise(resolve => target.close(resolve))
  await fs.rm(profile, { recursive: true, force: true })
}

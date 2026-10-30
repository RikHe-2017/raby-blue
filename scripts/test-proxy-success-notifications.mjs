import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const received = []
const serve = (request, response, local = false) => {
  received.push({ local, url: request.url, headers: request.headers })
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'none'; connect-src *; frame-src *"
  )
  if (request.url.includes('/fail')) return response.destroy()
  if (request.url.includes('/data') || request.url.includes('/slow')) {
    response.setHeader('Content-Type', 'application/json')
    const finish = () => response.end(JSON.stringify({ local, header: request.headers['x-test'] }))
    if (request.url.includes('/slow')) setTimeout(finish, 1200)
    else finish()
  } else {
    response.setHeader('Content-Type', 'text/html')
    response.end(`<h1>${local ? 'LOCAL' : 'SOURCE'}</h1>`)
  }
}
const source = http.createServer((request, response) => serve(request, response))
const target = http.createServer((request, response) => serve(request, response, true))
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'raby-notification-'))
let context
try {
  await new Promise(resolve => source.listen(0, '127.0.0.1', resolve))
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve))
  const sourceOrigin = `http://127.0.0.1:${source.address().port}`
  const targetOrigin = `http://127.0.0.1:${target.address().port}`
  context = await chromium.launchPersistentContext(profile, {
    executablePath:
      process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    viewport: { width: 1200, height: 800 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging']
  })
  const cdp = await context.browser().newBrowserCDPSession()
  await cdp.send('Extensions.loadUnpacked', { path: path.resolve('dist') })
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  worker.on('console', message => console.log('BACKGROUND:', message.text()))
  const page = await context.newPage()
  page.setDefaultTimeout(6000)
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message))
  const toast = page.locator('#raby-blue-proxy-success')
  const rule = (id, sourcePath, targetPath, extra = {}) => ({
    id,
    name: id,
    type: 'rule',
    groupId: 'g',
    enabled: true,
    sourceUrl: sourceOrigin + sourcePath,
    targetUrl: targetPath === null ? '' : targetOrigin + targetPath,
    showSuccessNotification: true,
    ...extra
  })
  const configure = async rules => {
    await worker.evaluate(
      rules =>
        chrome.storage.local.set({
          proxyConfig: {
            enabled: true,
            groups: [{ id: 'g', name: 'test', type: 'group', children: rules }]
          }
        }),
      rules
    )
    await page.waitForTimeout(600)
  }
  const fetchPage = async url => page.evaluate(async url => (await fetch(url)).json(), url)
  const waitToast = async () => {
    await toast.waitFor({ state: 'visible' })
    assert.equal(await toast.locator('.title').textContent(), '欢迎使用蓝兔')
    assert.equal(
      await toast.locator('.description').textContent(),
      '代理配置已生效，RabyBlue时刻为您服务～'
    )
    const presentation = await toast.locator('.title').evaluate(title => ({
      fontSize: getComputedStyle(title).fontSize,
      fontWeight: getComputedStyle(title).fontWeight,
      iconLast: title.lastElementChild?.className === 'icon'
    }))
    assert.deepEqual(presentation, { fontSize: '16px', fontWeight: '700', iconLast: true })
    assert.deepEqual(
      await toast.locator('.description').evaluate(node => ({
        fontSize: getComputedStyle(node).fontSize,
        color: getComputedStyle(node).color
      })),
      { fontSize: '12px', color: 'rgb(144, 147, 153)' }
    )
    assert.ok(
      await toast.locator('.icon').evaluate(canvas =>
        canvas
          .getContext('2d')
          .getImageData(0, 0, canvas.width, canvas.height)
          .data.some((value, index) => index % 4 === 3 && value > 0)
      ),
      'the bundled brand icon renders even under restrictive page CSP'
    )
  }
  const noToast = async () => {
    await page.waitForTimeout(500)
    assert.equal(await toast.count(), 0)
  }

  await page.goto(sourceOrigin + '/harness')
  await page.bringToFront()
  await configure([rule('off', '/off/', '/', { showSuccessNotification: false })])
  assert.equal((await fetchPage(sourceOrigin + '/off/data')).local, true)
  await noToast()
  console.log('PASS: default-off redirects work without page hints')

  await configure([rule('document', '/app/', '/')])
  await page.goto(sourceOrigin + '/app/')
  assert.equal(page.url(), sourceOrigin + '/app/')
  assert.equal(await page.locator('h1').textContent(), 'LOCAL')
  await waitToast()
  const box = await toast.boundingBox()
  assert.ok(box.width > 100 && box.width <= 360 && box.x + box.width <= 1200)
  assert.equal(
    await toast.locator('.notice').evaluate(node => getComputedStyle(node).backgroundColor),
    'rgb(255, 255, 255)'
  )
  await page.screenshot({ path: '/tmp/raby-proxy-success-notification.png' })
  await toast.waitFor({ state: 'detached', timeout: 4500 })
  console.log(
    'PASS: document replacement retains source URL; Shadow DOM toast survives hostile CSP and disappears after 3 seconds'
  )

  await page.goto(sourceOrigin + '/harness')
  await configure([rule('manual-close', '/dismiss/', '/')])
  await fetchPage(sourceOrigin + '/dismiss/data')
  await waitToast()
  const close = toast.getByRole('button', { name: '关闭提示' })
  assert.equal(await close.count(), 1, 'success notification has a manual close button')
  await page.screenshot({ path: '/tmp/raby-proxy-success-notification-close.png' })
  await close.click()
  assert.equal(await toast.count(), 0, 'clicking close removes the toast immediately')
  await fetchPage(sourceOrigin + '/dismiss/data')
  await noToast()
  console.log('PASS: manual close dismisses immediately without replaying the same rule')

  await page.goto(sourceOrigin + '/harness')
  await configure([rule('first', '/one/', '/'), rule('<second>', '/two/', '/')])
  const result = await page.evaluate(
    async origin =>
      Promise.all([
        fetch(origin + '/one/data').then(r => r.json()),
        fetch(origin + '/two/data').then(r => r.json())
      ]),
    sourceOrigin
  )
  assert.ok(result.every(item => item.local))
  await waitToast()
  assert.equal((await toast.locator('.notice').textContent()).includes('<second>'), false)
  assert.equal(await toast.locator('second').count(), 0, 'rule names use text, not HTML')
  await toast.waitFor({ state: 'detached', timeout: 4500 })
  await fetchPage(sourceOrigin + '/one/data')
  await noToast()
  console.log(
    'PASS: real native redirects merge two rules sharing a target and dedupe per document'
  )

  const other = await context.newPage()
  await other.goto(sourceOrigin + '/other')
  await page.goto(sourceOrigin + '/harness')
  await configure([rule('background', '/background/', '/')])
  await other.bringToFront()
  await page.waitForTimeout(200)
  assert.equal((await fetchPage(sourceOrigin + '/background/data')).local, true)
  await noToast()
  await page.bringToFront()
  await noToast()
  await fetchPage(sourceOrigin + '/background/data')
  await waitToast()
  await toast.waitFor({ state: 'detached', timeout: 4500 })
  console.log('PASS: background success does not show or replay; a fresh active request does show')

  await page.goto(sourceOrigin + '/harness')
  await configure([rule('slow', '/slow-rule/', '/')])
  await page.evaluate(url => {
    window.slowResult = fetch(url).then(r => r.json())
  }, sourceOrigin + '/slow-rule/slow')
  await page.waitForTimeout(200)
  await other.bringToFront()
  await page.waitForTimeout(200)
  await page.bringToFront()
  assert.equal((await page.evaluate(() => window.slowResult)).local, true)
  await noToast()
  await fetchPage(sourceOrigin + '/slow-rule/data')
  await waitToast()
  console.log('PASS: switch-away/back rejects pre-switch in-flight completions')

  await page.goto(sourceOrigin + '/harness')
  await configure([
    rule('headers', '/headers/', null, {
      requestHeaders: [{ id: 'h', name: 'X-Test', value: 'configured', enabled: true }]
    })
  ])
  assert.equal((await fetchPage(sourceOrigin + '/headers/data')).header, 'configured')
  await waitToast()
  console.log('PASS: headers-only native requests notify only after completed loading')

  await page.goto(sourceOrigin + '/harness')
  await configure([rule('iframe', '/frame/', '/')])
  await page.evaluate(url => {
    const frame = document.createElement('iframe')
    frame.src = url
    document.body.append(frame)
  }, sourceOrigin + '/frame/')
  await waitToast()
  assert.equal(await page.frames()[1].locator('#raby-blue-proxy-success').count(), 0)
  console.log('PASS: iframe proxy success displays only in the top document')

  await page.goto(sourceOrigin + '/harness')
  await configure([rule('failure', '/bad/', '/')])
  await page.evaluate(url => fetch(url).catch(() => {}), sourceOrigin + '/bad/fail')
  await noToast()
  console.log('PASS: failed target never produces a success toast')

  await page.goto(sourceOrigin + '/harness')
  await configure([rule('disabled', '/disabled/', '/')])
  await page.evaluate(url => {
    window.slowResult = fetch(url).then(r => r.json())
  }, sourceOrigin + '/disabled/slow')
  await page.waitForTimeout(150)
  await configure([rule('disabled', '/disabled/', '/', { showSuccessNotification: false })])
  await page.evaluate(() => window.slowResult)
  await noToast()
  console.log('PASS: disabling notification mid-flight invalidates the pending result')

  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto(sourceOrigin + '/harness')
  const longName = 'LONG_PROXY_NAME_'.repeat(12)
  await configure([rule(longName, '/compact/', '/')])
  await fetchPage(sourceOrigin + '/compact/data')
  await waitToast()
  const compactBox = await toast.boundingBox()
  assert.ok(compactBox.x >= 0 && compactBox.x + compactBox.width <= 360)
  assert.ok(await toast.locator('.notice').evaluate(node => node.scrollWidth <= node.clientWidth))
  await page.screenshot({ path: '/tmp/raby-proxy-success-notification-compact.png' })
  const compactClose = toast.getByRole('button', { name: '关闭提示' })
  const closeBox = await compactClose.boundingBox()
  assert.ok(closeBox.x >= 0 && closeBox.x + closeBox.width <= 360)
  await compactClose.focus()
  await page.keyboard.press('Enter')
  assert.equal(await toast.count(), 0, 'the close button is keyboard accessible on narrow screens')
  console.log('PASS: fixed copy and trailing brand icon fit the compact viewport without overflow')
} finally {
  await context?.close()
  source.closeAllConnections()
  target.closeAllConnections()
  await new Promise(resolve => source.close(resolve))
  await new Promise(resolve => target.close(resolve))
  await fs.rm(profile, { recursive: true, force: true })
}

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'raby-header-ui-'))
let context
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath:
      process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
    viewport: { width: 1100, height: 900 }
  })
  const cdp = await context.browser().newBrowserCDPSession()
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: path.resolve('dist') })
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const config = {
    enabled: false,
    groups: [
      {
        id: 'g',
        name: 'Frontend',
        enabled: false,
        type: 'group',
        children: [
          {
            id: 'r',
            name: 'Main app',
            type: 'rule',
            groupId: 'g',
            enabled: false,
            sourceUrl: 'http://example.test/app/',
            targetUrl: 'http://127.0.0.1:8098/'
          },
          {
            id: 'other',
            name: 'Other app',
            type: 'rule',
            groupId: 'g',
            enabled: false,
            sourceUrl: 'http://example.test/other/',
            targetUrl: 'http://127.0.0.1:8098/'
          }
        ]
      }
    ]
  }
  await worker.evaluate(
    async config =>
      chrome.storage.local.set({
        proxyConfig: config,
        userPreferences: {
          activeTab: 'proxy',
          proxyUIState: { activeGroupId: 'g', activeItemId: 'r', expandedKeys: ['g'] },
          proxySidebar: { openPanels: ['config'] }
        }
      }),
    config
  )
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`chrome-extension://${id}/index.html`)
  await page.getByLabel('目标地址（选填）').fill('')
  const request = page.getByRole('region', { name: '请求头设置' })
  const response = page.getByRole('region', { name: '响应头设置' })
  await request.getByRole('button', { name: '新增请求头设置' }).click()
  await request.getByRole('textbox', { name: '头名称' }).fill('X-Example')
  await request.getByRole('textbox', { name: '头值' }).fill('demo-value')
  await response.getByRole('button', { name: '新增响应头设置' }).click()
  await response.getByRole('textbox', { name: '头名称' }).fill('Access-Control-Allow-Origin')
  await response.getByRole('textbox', { name: '头值' }).fill('*')
  const read = async () =>
    worker.evaluate(async () => {
      const value = (await chrome.storage.local.get('proxyConfig')).proxyConfig
      return Object.values(value.groups).flatMap(group => Object.values(group.children))
    })
  const until = async predicate => {
    for (let i = 0; i < 60; i++) {
      if (await predicate()) return
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    console.log('STORED', JSON.stringify(await read()))
    console.log('PAGEERRORS', errors)
    console.log('UI', await page.locator('body').innerText())
    await page.screenshot({ path: '/tmp/raby-headers-ui-failure.png', fullPage: true })
    throw new Error('UI persistence timed out')
  }
  await until(
    async () => (await read()).find(rule => rule.id === 'r').responseHeaders?.[0]?.value === '*'
  )
  assert.equal((await read()).find(rule => rule.id === 'r').requestHeaders[0].value, 'demo-value')
  assert.equal((await read()).find(rule => rule.id === 'r').targetUrl, '')
  await until(async () => (await request.getByText('已保存').count()) === 1)
  await request.getByRole('button', { name: '新增请求头设置' }).click()
  await request.getByRole('textbox', { name: '头名称' }).nth(1).fill('x-example')
  await page.waitForTimeout(650)
  assert.ok(await request.getByRole('alert').innerText())
  assert.equal((await read()).find(rule => rule.id === 'r').requestHeaders.length, 1)
  await request.getByRole('button', { name: '删除头设置' }).nth(1).click()
  await until(async () => (await request.getByText('已保存').count()) === 1)
  await request.locator('label.el-checkbox').click()
  await until(
    async () => (await read()).find(rule => rule.id === 'r').requestHeaders[0].enabled === false
  )
  await request.locator('label.el-checkbox').click()
  await until(
    async () => (await read()).find(rule => rule.id === 'r').requestHeaders[0].enabled === true
  )
  await request.getByRole('textbox', { name: '头名称' }).fill('Host')
  await page.waitForTimeout(600)
  assert.match(await request.getByRole('alert').innerText(), /暂不支持/)
  assert.equal((await read()).find(rule => rule.id === 'r').requestHeaders[0].name, 'X-Example')
  await page.getByText('Other app', { exact: true }).click()
  await page.getByText('Main app', { exact: true }).click()
  assert.equal(await request.getByRole('textbox', { name: '头名称' }).inputValue(), 'Host')
  await request.getByRole('textbox', { name: '头名称' }).fill('X-Example')
  await request
    .getByRole('textbox', { name: '头值' })
    .fill('a-long-header-value-to-check-wrapping-and-avoid-text-overlap-with-neighboring-controls')
  await until(async () => (await request.getByText('已保存').count()) === 1)
  await request.scrollIntoViewIfNeeded()
  await page.screenshot({ path: '/tmp/raby-headers-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 800, height: 650 })
  await response.scrollIntoViewIfNeeded()
  await page.screenshot({ path: '/tmp/raby-headers-compact.png', fullPage: true })
  const overflow = await request.evaluate(el => el.scrollWidth > el.clientWidth + 1)
  assert.equal(overflow, false)
  await page.getByRole('button', { name: 'Main app的操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '复制代理', exact: true }).click()
  await until(async () => (await read()).some(rule => rule.name === 'Main app - 副本'))
  const copied = (await read()).find(rule => rule.name === 'Main app - 副本')
  const original = (await read()).find(rule => rule.id === 'r')
  assert.equal(copied.requestHeaders[0].value, original.requestHeaders[0].value)
  assert.notEqual(copied.requestHeaders[0].id, original.requestHeaders[0].id)
  await page.getByText('Main app - 副本', { exact: true }).click()
  await request.getByRole('textbox', { name: '头值' }).fill('copy-only')
  await until(
    async () =>
      (await read()).find(rule => rule.id === copied.id).requestHeaders[0].value === 'copy-only'
  )
  assert.equal(
    (await read()).find(rule => rule.id === 'r').requestHeaders[0].value,
    original.requestHeaders[0].value
  )
  await page.reload()
  assert.equal(await request.getByRole('textbox', { name: '头值' }).inputValue(), 'copy-only')
  await request.getByRole('textbox', { name: '头值' }).fill('header-save-overlap')
  await page.waitForTimeout(250)
  const nameInput = page.getByPlaceholder('请输入代理名称')
  await nameInput.fill('Renamed copy')
  await page.waitForTimeout(350)
  assert.equal(
    await nameInput.inputValue(),
    'Renamed copy',
    'saving header arrays must not reset the pending name draft'
  )
  await until(
    async () => (await read()).find(rule => rule.id === copied.id).name === 'Renamed copy'
  )
  await request.getByRole('button', { name: '删除头设置' }).click()
  await until(
    async () => (await read()).find(rule => rule.id === copied.id).requestHeaders.length === 0
  )
  const requestHeading = request.getByRole('heading', { name: '请求头设置' })
  await requestHeading.focus()
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('role')), 'status')
  await requestHeading.hover()
  await page
    .getByRole('tooltip')
    .filter({ hasText: '文档响应替换配置请求头后' })
    .waitFor({ state: 'visible' })
  assert.deepEqual(errors, [])
  console.log(
    'PASS: header UI add/edit/disable/delete, validation, independent drafts, persisted saves, desktop/compact layout'
  )
} finally {
  await context?.close()
  await fs.rm(profile, { recursive: true, force: true })
}

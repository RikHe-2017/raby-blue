import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'raby-success-setting-'))
let context
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath:
      process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
    viewport: { width: 1100, height: 800 }
  })
  const cdp = await context.browser().newBrowserCDPSession()
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: path.resolve('dist') })
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const rule = (id, name) => ({
    id,
    name,
    type: 'rule',
    groupId: 'g',
    enabled: false,
    sourceUrl: `http://example.test/${id}/`,
    targetUrl: ''
  })
  await worker.evaluate(
    config =>
      chrome.storage.local.set({
        proxyConfig: config,
        userPreferences: {
          activeTab: 'proxy',
          proxySidebar: { openPanels: ['config'] },
          proxyUIState: { activeGroupId: 'g', activeItemId: 'legacy', expandedKeys: ['g'] }
        }
      }),
    {
      enabled: false,
      groups: [
        {
          id: 'g',
          name: 'Fixture',
          type: 'group',
          enabled: true,
          children: [
            rule('legacy', 'Legacy rule'),
            { ...rule('other', 'Other rule'), showSuccessNotification: true }
          ]
        }
      ]
    }
  )
  const page = await context.newPage()
  page.setDefaultTimeout(5000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`chrome-extension://${id}/index.html`)
  const section = page.getByRole('region', { name: '代理成功提示', exact: true })
  const toggle = section.getByRole('switch', { name: '在被代理的页面上展示代理成功提示' })
  const toggleControl = section.locator('.el-switch')
  await toggleControl.waitFor()
  assert.equal(
    await toggle.getAttribute('aria-checked'),
    'false',
    'old rules without the field default to off'
  )
  const notificationTop = (await section.boundingBox()).y
  const nameTop = (await page.locator('.name-editor').boundingBox()).y
  assert.ok(notificationTop < nameTop, 'notification section must precede proxy name')
  const readRules = () =>
    worker.evaluate(async () =>
      Object.values((await chrome.storage.local.get('proxyConfig')).proxyConfig.groups).flatMap(
        group => Object.values(group.children)
      )
    )
  const until = async predicate => {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await predicate()) return
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error('Success notification setting did not persist')
  }
  await toggleControl.click()
  await until(
    async () =>
      (await readRules()).find(item => item.id === 'legacy').showSuccessNotification === true
  )
  await section.getByText('已保存', { exact: true }).waitFor()
  await page.getByText('Other rule', { exact: true }).click()
  assert.equal(await toggle.getAttribute('aria-checked'), 'true')
  await toggleControl.click()
  await until(
    async () =>
      (await readRules()).find(item => item.id === 'other').showSuccessNotification === false
  )
  await page.getByText('Legacy rule', { exact: true }).click()
  assert.equal(
    await toggle.getAttribute('aria-checked'),
    'true',
    'rules must retain independent settings'
  )
  await page.reload()
  await toggleControl.waitFor()
  assert.equal(
    await toggle.getAttribute('aria-checked'),
    'true',
    'setting survives reopening the popup document'
  )
  await page.evaluate(() => {
    const original = chrome.storage.local.set.bind(chrome.storage.local)
    let failed = false
    chrome.storage.local.set = async values => {
      if ('proxyConfig' in values && !failed) {
        failed = true
        throw new Error('Fixture storage failure')
      }
      return original(values)
    }
  })
  await toggleControl.click()
  await page.getByText('代理成功提示设置保存失败，请重试', { exact: true }).waitFor()
  await until(async () => (await toggle.getAttribute('aria-checked')) === 'true')
  assert.equal(
    (await readRules()).find(item => item.id === 'legacy').showSuccessNotification,
    true,
    'failed saves roll back without changing persisted data'
  )
  await page.getByRole('button', { name: 'Legacy rule的操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '复制代理', exact: true }).click()
  await until(async () => (await readRules()).some(item => item.name === 'Legacy rule - 副本'))
  const copied = (await readRules()).find(item => item.name === 'Legacy rule - 副本')
  assert.equal(copied.showSuccessNotification, true, 'copy retains the source setting')
  await page.getByText('Legacy rule - 副本', { exact: true }).click()
  await toggleControl.click()
  await until(
    async () =>
      (await readRules()).find(item => item.id === copied.id).showSuccessNotification === false
  )
  assert.equal((await readRules()).find(item => item.id === 'legacy').showSuccessNotification, true)
  await page.getByRole('button', { name: 'Fixture的操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '创建代理', exact: true }).click()
  await until(async () => (await readRules()).some(item => item.name === '新代理'))
  assert.equal(
    (await readRules()).find(item => item.name === '新代理').showSuccessNotification,
    false,
    'new rules explicitly default to false'
  )
  await page.keyboard.press('Escape')
  await page
    .getByText('代理成功提示设置保存失败，请重试', { exact: true })
    .waitFor({ state: 'hidden' })
  await page.locator('.el-dropdown__popper:visible').waitFor({ state: 'hidden' })
  await section.scrollIntoViewIfNeeded()
  await page.screenshot({ path: '/tmp/raby-success-setting-desktop.png' })
  await page.setViewportSize({ width: 800, height: 600 })
  await page.screenshot({ path: '/tmp/raby-success-setting-compact.png' })
  assert.equal(await section.evaluate(el => el.scrollWidth > el.clientWidth + 1), false)
  await page.getByText('Fixture', { exact: true }).click()
  assert.equal(await section.count(), 0, 'group nodes do not own a proxy notification switch')
  assert.deepEqual(errors, [])
  console.log(
    'PASS: success notification setting defaults off, persists per rule, survives reload/copy, defaults new rules off and stays above proxy name without overflow'
  )
} finally {
  await context?.close()
  await fs.rm(profile, { recursive: true, force: true })
}

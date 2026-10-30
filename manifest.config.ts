import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest(({ command }) => ({
  manifest_version: 3,
  minimum_chrome_version: '125',
  name: command === 'serve' ? 'RabyBlue Dev' : 'RabyBlue',
  version: '1.0.0',
  description: 'Proxy requests with redirects and response replacement',
  permissions: [
    'storage',
    'declarativeNetRequest',
    'declarativeNetRequestWithHostAccess',
    'declarativeNetRequestFeedback',
    'scripting',
    'debugger',
    'webNavigation',
    'webRequest',
    'tabs'
  ],
  host_permissions: ['<all_urls>'],
  action: {
    default_popup: 'index.html'
  },
  background: {
    service_worker: 'src/background.ts',
    type: 'module'
  },
  icons: {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png'
  }
}))

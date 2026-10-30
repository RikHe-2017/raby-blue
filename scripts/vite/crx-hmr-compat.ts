import type { Plugin } from 'vite'

export function replaceCrxLiveReload(code: string, id: string, enabled: boolean): string | null {
  if (id.split('?')[0] !== '/@crx/client-worker' || !code.includes('__LIVE_RELOAD__')) return null
  return code.replaceAll('__LIVE_RELOAD__', JSON.stringify(enabled))
}

// CRXJS 2.7.1 replaces only the first occurrence in its worker HMR template.
export function crxHmrCompatibility(enabled: boolean): Plugin {
  return {
    name: 'raby:crx-worker-live-reload-compatibility',
    apply: 'serve',
    enforce: 'post',
    transform(code, id) {
      const fixed = replaceCrxLiveReload(code, id, enabled)
      return fixed === null ? null : { code: fixed, map: null }
    }
  }
}

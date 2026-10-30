// This function is serialized by executeScript; keep every dependency inside it.
export async function installProxySuccessNotification(iconDataUrl: string) {
  const scope = globalThis as typeof globalThis & { rabyBlueSuccessInstalled?: boolean }
  if (scope.rabyBlueSuccessInstalled) return true
  if (document.visibilityState !== 'visible') return false
  const bytes = Uint8Array.from(atob(iconDataUrl.split(',')[1]), character =>
    character.charCodeAt(0)
  )
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
  if (document.visibilityState !== 'visible') return false
  if (scope.rabyBlueSuccessInstalled) return true
  scope.rabyBlueSuccessInstalled = true
  let host: HTMLElement | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const hide = () => {
    clearTimeout(timer)
    host?.remove()
    host = undefined
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') hide()
  })
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message?.action !== 'proxySuccess') return
    if (document.visibilityState !== 'visible' || !Array.isArray(message.items)) {
      respond({ shown: false })
      return
    }
    const items = message.items.filter(
      (item: { name?: unknown; mapped?: unknown }) =>
        typeof item?.name === 'string' && typeof item.mapped === 'boolean'
    ) as { name: string; mapped: boolean }[]
    if (!items.length) return
    hide()
    host = document.createElement('div')
    host.id = 'raby-blue-proxy-success'
    const shadow = host.attachShadow({ mode: 'open' })
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(`
      :host { all: initial !important; display: block !important;
        position: fixed !important; top: 16px !important; right: 16px !important;
        z-index: 2147483647 !important; pointer-events: none !important;
        width: max-content !important; max-width: calc(100vw - 32px) !important; }
      .notice { display: flex; align-items: flex-start; gap: 12px;
        box-sizing: border-box; max-width: 360px; padding: 12px 16px;
        border: 1px solid #dcdfe6; border-left: 3px solid #67c23a; border-radius: 4px;
        background: #fff; color: #303133; box-shadow: 0 2px 12px #0002;
        font: 14px/1.5 system-ui, sans-serif; overflow-wrap: anywhere; }
      .content { flex: 1; min-width: 0; }
      .title { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 700; }
      .icon { width: 16px; height: 16px; flex: none; }
      .description { margin-top: 4px; font-size: 12px; color: #909399; }
      .close { display: inline-flex; align-items: center; justify-content: center; flex: none;
        width: 20px; height: 20px; margin-top: 2px; padding: 0; border: 0; border-radius: 4px;
        background: transparent; color: #909399; font: 22px/1 system-ui, sans-serif;
        cursor: pointer; pointer-events: auto; }
      .close:hover { background: #f5f7fa; color: #606266; }
      .close:focus-visible { outline: 2px solid #409eff; outline-offset: 2px; }
    `)
    shadow.adoptedStyleSheets = [sheet]
    const notice = document.createElement('div')
    notice.className = 'notice'
    notice.setAttribute('role', 'status')
    notice.setAttribute('aria-live', 'polite')
    const title = document.createElement('div')
    title.className = 'title'
    const heading = document.createElement('span')
    heading.textContent = '欢迎使用蓝兔'
    const icon = document.createElement('canvas')
    icon.className = 'icon'
    icon.width = bitmap.width
    icon.height = bitmap.height
    icon.setAttribute('aria-hidden', 'true')
    icon.getContext('2d')?.drawImage(bitmap, 0, 0)
    title.append(heading, icon)
    const description = document.createElement('div')
    description.className = 'description'
    description.textContent = '代理配置已生效，RabyBlue时刻为您服务～'
    const content = document.createElement('div')
    content.className = 'content'
    content.append(title, description)
    const close = document.createElement('button')
    close.className = 'close'
    close.type = 'button'
    close.setAttribute('aria-label', '关闭提示')
    close.title = '关闭提示'
    const closeIcon = document.createElement('span')
    closeIcon.setAttribute('aria-hidden', 'true')
    closeIcon.textContent = '×'
    close.append(closeIcon)
    close.addEventListener('click', event => {
      event.stopPropagation()
      hide()
    })
    notice.append(content, close)
    shadow.append(notice)
    document.documentElement.append(host)
    timer = setTimeout(hide, 3000)
    respond({ shown: true })
  })
  return true
}

import { describe, expect, it } from 'vitest'
import { defaultLocale, i18n } from './index'

describe('application localization', () => {
  it('uses Chinese as the default locale', () => {
    expect(defaultLocale).toBe('zh-CN')
    expect(i18n.global.locale.value).toBe('zh-CN')
  })

  it('provides Chinese and English extension messages', () => {
    const englishMessages = i18n.global.getLocaleMessage('en-US') as {
      extension: {
        name: string
        welcome: string
      }
    }

    expect(i18n.global.t('extension.name')).toBe('RabyBlue')
    expect(i18n.global.t('extension.welcome')).toContain('蓝兔')
    expect(englishMessages.extension.name).toBe('RabyBlue')
    expect(englishMessages.extension.welcome).toContain('Welcome')
  })
})

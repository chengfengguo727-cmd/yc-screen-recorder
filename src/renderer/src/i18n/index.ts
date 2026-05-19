import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { zhTW } from './locales/zh-TW'
import { en } from './locales/en'

export const SUPPORTED_LANGS = [
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'en', label: 'English' }
] as const

export type UILang = (typeof SUPPORTED_LANGS)[number]['code']

void i18n.use(initReactI18next).init({
  resources: {
    'zh-TW': { translation: zhTW },
    en: { translation: en }
  },
  lng: 'zh-TW',
  fallbackLng: 'zh-TW',
  interpolation: { escapeValue: false }
})

export function setLanguage(code: UILang): void {
  void i18n.changeLanguage(code)
}

export default i18n

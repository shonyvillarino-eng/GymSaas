import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import esCommon from './locales/es/common.json';
import enCommon from './locales/en/common.json';
import ptCommon from './locales/pt/common.json';

/**
 * Supported languages. New installations start in Spanish; the authenticated
 * session replaces this with the user preference, then the gym default.
 *
 * The browser detector is deliberately not used: the priority is defined by
 * the server (personal > gym > Spanish), not by the visitor's OS language.
 */
export const SUPPORTED_LANGUAGES = ['es', 'en', 'pt'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const resources = {
  es: { common: esCommon },
  en: { common: enCommon },
  pt: { common: ptCommon },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'es',
  fallbackLng: 'es',
  supportedLngs: [...SUPPORTED_LANGUAGES],
  defaultNS: 'common',
  ns: ['common'],
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
});

export default i18n;

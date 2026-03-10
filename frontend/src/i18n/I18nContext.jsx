import React, { createContext, useContext, useState, useCallback } from 'react';
import { de, en } from './translations.js';

const langs = { de, en };
const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem('lang');
    if (saved) return saved;
    const browser = (navigator.language || navigator.languages?.[0] || '').toLowerCase();
    return browser.startsWith('de') ? 'de' : 'en';
  });

  const t = useCallback((key, vars) => {
    const dict = langs[lang] ?? langs.de;
    const val = key.split('.').reduce((o, k) => o?.[k], dict);
    if (val === undefined) return key;
    if (!vars) return val;
    return Object.entries(vars).reduce(
      (s, [k, v]) => s.replace(`{${k}}`, v),
      val
    );
  }, [lang]);

  const switchLang = useCallback((l) => {
    setLang(l);
    localStorage.setItem('lang', l);
  }, []);

  return (
    <I18nContext.Provider value={{ t, lang, switchLang }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  return useContext(I18nContext);
}

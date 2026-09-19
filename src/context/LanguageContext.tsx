'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import heDict from '@/locales/he.json';
import enDict from '@/locales/en.json';
import arDict from '@/locales/ar.json';

export type Language = 'he' | 'en' | 'ar';
export type Direction = 'rtl' | 'ltr';

interface LanguageContextType {
  lang: Language;
  dir: Direction;
  setLanguage: (lang: Language) => void;
  t: (key: string, fallback?: string) => string;
}

const dictionaries: Record<Language, Record<string, unknown>> = {
  he: heDict as Record<string, unknown>,
  en: enDict as Record<string, unknown>,
  ar: arDict as Record<string, unknown>,
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('tooly_lang');
        if (stored === 'he' || stored === 'en' || stored === 'ar') {
          return stored;
        }
      } catch (err) {
        console.warn('Error reading tooly_lang from localStorage:', err);
      }
    }
    return 'he';
  });

  const dir: Direction = useMemo(() => (lang === 'en' ? 'ltr' : 'rtl'), [lang]);

  // Synchronize document dir and lang attributes
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = dir;
      document.documentElement.lang = lang;
    }
  }, [dir, lang]);

  const setLanguage = useCallback((newLang: Language) => {
    setLangState(newLang);
    const newDir: Direction = newLang === 'en' ? 'ltr' : 'rtl';
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('tooly_lang', newLang);
      } catch (err) {
        console.warn('Error saving tooly_lang to localStorage:', err);
      }
      document.documentElement.dir = newDir;
      document.documentElement.lang = newLang;
    }
  }, []);

  const t = useCallback(
    (key: string, fallback?: string): string => {
      const activeDict = dictionaries[lang] || dictionaries.he;

      // 1. Nested dot-notation lookup (e.g., 'nav.scanner')
      if (key.includes('.')) {
        const parts = key.split('.');
        let current: unknown = activeDict;
        for (const part of parts) {
          if (current && typeof current === 'object' && part in current) {
            current = (current as Record<string, unknown>)[part];
          } else {
            current = undefined;
            break;
          }
        }
        if (typeof current === 'string') return current;
      }

      // 2. Direct key lookup
      if (key in activeDict && typeof activeDict[key] === 'string') {
        return activeDict[key] as string;
      }

      // 3. Fallback to Hebrew authoritative dictionary if not 'he'
      if (lang !== 'he') {
        const hebrewDict = dictionaries.he;
        if (key.includes('.')) {
          const parts = key.split('.');
          let current: unknown = hebrewDict;
          for (const part of parts) {
            if (current && typeof current === 'object' && part in current) {
              current = (current as Record<string, unknown>)[part];
            } else {
              current = undefined;
              break;
            }
          }
          if (typeof current === 'string') return current;
        } else if (key in hebrewDict && typeof hebrewDict[key] === 'string') {
          return hebrewDict[key] as string;
        }
      }

      return fallback ?? key;
    },
    [lang]
  );

  const contextValue = useMemo(
    () => ({
      lang,
      dir,
      setLanguage,
      t,
    }),
    [lang, dir, setLanguage, t]
  );

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

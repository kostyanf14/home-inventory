import { createContext, ReactNode, useContext, useEffect, useState } from "react";

import { enMessages, type TranslationKey } from "./i18n/messages/en";
import { uaMessages } from "./i18n/messages/ua";

export type { TranslationKey } from "./i18n/messages/en";
export type Language = "en" | "ua";

export type TranslationParams = Record<string, string | number>;

type TranslationContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
};

const translations = {
  en: enMessages,
  ua: uaMessages,
};

const TranslationContext = createContext<TranslationContextValue | null>(null);

function getInitialLanguage(): Language {
  return localStorage.getItem("inventory-language") === "ua" ? "ua" : "en";
}

export function TranslationProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);

  useEffect(() => {
    localStorage.setItem("inventory-language", language);
    document.documentElement.lang = language === "ua" ? "uk" : "en";
  }, [language]);

  function t(key: TranslationKey, params?: TranslationParams) {
    const message: string = translations[language][key];

    if (!params) {
      return message;
    }

    return message.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match
    );
  }

  return (
    <TranslationContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(TranslationContext);

  if (!context) {
    throw new Error("useTranslation must be used within TranslationProvider.");
  }

  return context;
}

import { createContext, ReactNode, useContext, useEffect, useState } from "react";

import { enMessages, type TranslationKey } from "./i18n/messages/en";
import { uaMessages } from "./i18n/messages/ua";

export type { TranslationKey } from "./i18n/messages/en";
export type Language = "en" | "ua";

type TranslationContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
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

  function t(key: TranslationKey) {
    return translations[language][key];
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

import { Languages } from "lucide-react";

import { useTranslation } from "../i18n";

export function LanguageSwitcher() {
  const { language, setLanguage } = useTranslation();

  return (
    <div className="language-switcher" aria-label="Language">
      <Languages size={16} aria-hidden="true" />
      <div className="language-switcher-pills">
        <button
          type="button"
          className={language === "en" ? "active" : ""}
          aria-pressed={language === "en"}
          onClick={() => setLanguage("en")}
        >
          EN
        </button>
        <button
          type="button"
          className={language === "ua" ? "active" : ""}
          aria-pressed={language === "ua"}
          onClick={() => setLanguage("ua")}
        >
          UA
        </button>
      </div>
    </div>
  );
}

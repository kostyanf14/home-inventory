import { Archive, Barcode, Boxes, ChevronDown, MapPin, ShieldCheck } from "lucide-react";

import type { ActiveView } from "../types";
import { type TranslationKey, useTranslation } from "../i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";

type AppSidebarProps = {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  onNotice: (key: TranslationKey) => void;
  onSignOut: () => void;
};

export function AppSidebar({ activeView, onViewChange, onNotice, onSignOut }: AppSidebarProps) {
  const { t } = useTranslation();

  return (
    <aside className="sidebar">
      <a className="brand" href="#top" aria-label="Storied home">
        <span className="brand-mark">
          <Archive size={22} />
        </span>
        <span>Storied</span>
      </a>
      <nav aria-label="Main navigation">
        <button
          className={activeView === "inventory" ? "nav-link selected" : "nav-link"}
          onClick={() => onViewChange("inventory")}
        >
          <Boxes size={18} />
          {t("inventory")}
        </button>
        <button
          className={activeView === "locations" ? "nav-link selected" : "nav-link"}
          onClick={() => onViewChange("locations")}
        >
          <MapPin size={18} />
          {t("locations")}
        </button>
        <button className="nav-link" onClick={() => onNotice("barcodeReady")}>
          <Barcode size={18} />
          {t("scanLookup")}
        </button>
        <button className="nav-link" onClick={() => onNotice("remindersComing")}>
          <ShieldCheck size={18} />
          {t("reminders")}
        </button>
      </nav>
      <div className="sidebar-bottom">
        <LanguageSwitcher />
        <button className="profile" onClick={onSignOut}>
          <span>HI</span>
          <strong>{t("signOut")}</strong>
          <ChevronDown size={15} />
        </button>
      </div>
    </aside>
  );
}

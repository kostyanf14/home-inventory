import { Archive, Barcode, Boxes, ChevronDown, MapPin, Pill, ShieldCheck } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";

import { api } from "../api";
import { type TranslationKey, useTranslation } from "../i18n";
import { pathFromView } from "../routes";
import type { ActiveView } from "../types";
import { LanguageSwitcher } from "./LanguageSwitcher";

type AppEnvironment = "development" | "test";

type AppSidebarProps = {
  activeView: ActiveView;
  token: string;
  onViewChange: (view: ActiveView) => void;
  onNotice: (key: TranslationKey) => void;
  onScanLookup: () => void;
  onSignOut: () => void;
};

function readNonProductionEnvironment(data: unknown, viteDev: boolean): AppEnvironment | null {
  if (data && typeof data === "object" && !Array.isArray(data) && "environment" in data) {
    const env = (data as { environment: unknown }).environment;
    if (env === "production") {
      return null;
    }
    if (env === "development" || env === "test") {
      return env;
    }
  }
  return viteDev ? "development" : null;
}

export function AppSidebar({
  activeView,
  token,
  onViewChange,
  onNotice,
  onScanLookup,
  onSignOut,
}: AppSidebarProps) {
  const { t } = useTranslation();
  const [environment, setEnvironment] = useState<AppEnvironment | null>(
    import.meta.env.DEV ? "development" : null
  );

  useEffect(() => {
    let cancelled = false;

    void api<unknown>("/meta", token)
      .then((data) => {
        if (!cancelled) {
          setEnvironment(readNonProductionEnvironment(data, import.meta.env.DEV));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEnvironment(import.meta.env.DEV ? "development" : null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  function openView(event: MouseEvent<HTMLAnchorElement>, view: ActiveView) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    onViewChange(view);
  }

  return (
    <aside className="sidebar">
      <a className="brand" href="#top" aria-label="Storied home">
        <span className="brand-mark">
          <Archive size={22} />
        </span>
        <span>Storied</span>
      </a>
      <nav aria-label="Main navigation">
        <a
          href={pathFromView("inventory")}
          className={activeView === "inventory" ? "nav-link selected" : "nav-link"}
          aria-current={activeView === "inventory" ? "page" : undefined}
          onClick={(event) => openView(event, "inventory")}
        >
          <Boxes size={18} />
          {t("inventory")}
        </a>
        <a
          href={pathFromView("medicines")}
          className={activeView === "medicines" ? "nav-link selected" : "nav-link"}
          aria-current={activeView === "medicines" ? "page" : undefined}
          onClick={(event) => openView(event, "medicines")}
        >
          <Pill size={18} />
          {t("medicines")}
        </a>
        <a
          href={pathFromView("locations")}
          className={activeView === "locations" ? "nav-link selected" : "nav-link"}
          aria-current={activeView === "locations" ? "page" : undefined}
          onClick={(event) => openView(event, "locations")}
        >
          <MapPin size={18} />
          {t("locations")}
        </a>
        <button className="nav-link" onClick={onScanLookup}>
          <Barcode size={18} />
          {t("scanLookup")}
        </button>
        <button className="nav-link" onClick={() => onNotice("remindersComing")}>
          <ShieldCheck size={18} />
          {t("reminders")}
        </button>
      </nav>
      <div className="sidebar-bottom">
        {environment && (
          <p className={`env-note ${environment}`} role="note">
            {environment === "test" ? t("testEnvironment") : t("devEnvironment")}
          </p>
        )}
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

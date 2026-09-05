import {
  Archive,
  Barcode,
  Boxes,
  MapPin,
  MoreHorizontal,
  Pill,
  ShieldCheck,
  SquarePen,
  X,
} from "lucide-react";
import { useEffect, useId, useState, type MouseEvent, type ReactNode } from "react";

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

function ExtraLinks({
  scanLabel,
  remindersLabel,
  onScanLookup,
  onReminders,
}: {
  scanLabel: string;
  remindersLabel: string;
  onScanLookup: () => void;
  onReminders: () => void;
}) {
  return (
    <>
      <button className="nav-link" onClick={onScanLookup}>
        <Barcode size={18} />
        {scanLabel}
      </button>
      <button className="nav-link" onClick={onReminders}>
        <ShieldCheck size={18} />
        {remindersLabel}
      </button>
    </>
  );
}

function Account({
  environment,
  testLabel,
  devLabel,
  signOutLabel,
  onSignOut,
}: {
  environment: AppEnvironment | null;
  testLabel: string;
  devLabel: string;
  signOutLabel: string;
  onSignOut: () => void;
}) {
  return (
    <div className="sidebar-bottom">
      {environment && (
        <p className={`env-note ${environment}`} role="note">
          {environment === "test" ? testLabel : devLabel}
        </p>
      )}
      <LanguageSwitcher />
      <button className="profile" onClick={onSignOut}>
        <span>HI</span>
        <strong>{signOutLabel}</strong>
      </button>
    </div>
  );
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
  const moreTitleId = useId();
  const [moreOpen, setMoreOpen] = useState(false);
  const [compactNav, setCompactNav] = useState(
    () => window.matchMedia("(max-width: 1023px)").matches
  );
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

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    function sync(event: MediaQueryListEvent) {
      setCompactNav(event.matches);
      if (!event.matches) {
        setMoreOpen(false);
      }
    }
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("compact-nav", compactNav);
    return () => document.documentElement.classList.remove("compact-nav");
  }, [compactNav]);

  useEffect(() => {
    document.body.classList.toggle("sheet-open", moreOpen);
    return () => document.body.classList.remove("sheet-open");
  }, [moreOpen]);

  function openView(event: MouseEvent<HTMLAnchorElement>, view: ActiveView) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    setMoreOpen(false);
    onViewChange(view);
  }

  const primaryLinks: { view: ActiveView; icon: ReactNode; label: string }[] = [
    { view: "inventory", icon: <Boxes size={20} />, label: t("inventory") },
    { view: "medicines", icon: <Pill size={20} />, label: t("medicines") },
    { view: "locations", icon: <MapPin size={20} />, label: t("locations") },
    { view: "items", icon: <SquarePen size={20} />, label: t("items") },
  ];

  const extraLinks = (
    <ExtraLinks
      scanLabel={t("scanLookup")}
      remindersLabel={t("reminders")}
      onScanLookup={() => {
        setMoreOpen(false);
        onScanLookup();
      }}
      onReminders={() => {
        setMoreOpen(false);
        onNotice("remindersComing");
      }}
    />
  );

  const account = (
    <Account
      environment={environment}
      testLabel={t("testEnvironment")}
      devLabel={t("devEnvironment")}
      signOutLabel={t("signOut")}
      onSignOut={onSignOut}
    />
  );

  const viewLinks = primaryLinks.map((link) => (
    <a
      key={link.view}
      href={pathFromView(link.view)}
      className={
        compactNav
          ? activeView === link.view
            ? "bottom-nav-link selected"
            : "bottom-nav-link"
          : activeView === link.view
            ? "nav-link selected"
            : "nav-link"
      }
      aria-current={activeView === link.view ? "page" : undefined}
      onClick={(event) => openView(event, link.view)}
    >
      {link.icon}
      {link.label}
    </a>
  ));

  return (
    <>
      {!compactNav && (
        <aside className="sidebar">
          <a className="brand" href="#top" aria-label="Storied home">
            <span className="brand-mark">
              <Archive size={20} />
            </span>
            <span>Storied</span>
          </a>
          <nav aria-label="Main navigation">
            {viewLinks}
            {extraLinks}
          </nav>
          {account}
        </aside>
      )}
      {compactNav && (
        <nav className="bottom-nav" aria-label="Main navigation">
          {viewLinks}
          <button
            type="button"
            className={moreOpen ? "bottom-nav-link selected" : "bottom-nav-link"}
            aria-expanded={moreOpen}
            aria-controls={moreTitleId}
            onClick={() => setMoreOpen(true)}
          >
            <MoreHorizontal size={20} />
            {t("more")}
          </button>
        </nav>
      )}
      {moreOpen && compactNav && (
        <div className="sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div
            className="more-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={moreTitleId}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="more-sheet-head">
              <h2 id={moreTitleId}>{t("more")}</h2>
              <button
                type="button"
                className="icon-button"
                aria-label={t("closeMore")}
                onClick={() => setMoreOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="more-sheet-nav">{extraLinks}</div>
            {account}
          </div>
        </div>
      )}
    </>
  );
}

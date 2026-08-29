import { useState } from "react";
import { CirclePlus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./api";
import { AppSidebar } from "./components/AppSidebar";
import { InventoryView } from "./components/InventoryView";
import { LocationsView } from "./components/LocationsView";
import { Welcome } from "./components/Welcome";
import { useTranslation } from "./i18n";
import type { TranslationKey } from "./i18n";
import type { ActiveView, AuthMode, Item, Place, Site } from "./types";

type Notice = { key: TranslationKey } | { message: string };

function App() {
  const { t } = useTranslation();
  const [token, setToken] = useState(() => localStorage.getItem("inventory-token") ?? "");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [activeView, setActiveView] = useState<ActiveView>("inventory");
  const [notice, setNotice] = useState<Notice | null>(null);
  const client = useQueryClient();

  const sites = useQuery({
    queryKey: ["sites"],
    queryFn: () => api<Site[]>("/sites", token),
    enabled: Boolean(token),
  });
  const places = useQuery({
    queryKey: ["places"],
    queryFn: () => api<Place[]>("/places", token),
    enabled: Boolean(token),
  });
  const items = useQuery({
    queryKey: ["items"],
    queryFn: () => api<Item[]>("/inventory-items", token),
    enabled: Boolean(token),
  });

  function invalidateInventory() {
    void client.invalidateQueries({ queryKey: ["sites"] });
    void client.invalidateQueries({ queryKey: ["places"] });
    void client.invalidateQueries({ queryKey: ["items"] });
  }

  function signOut() {
    localStorage.removeItem("inventory-token");
    setToken("");
    setActiveView("inventory");
  }

  function authenticate(newToken: string) {
    localStorage.setItem("inventory-token", newToken);
    setToken(newToken);
    setAuthOpen(false);
  }

  function changeView(view: ActiveView) {
    setActiveView(view);
    setNotice(null);
  }

  function showNotice(message: string) {
    setNotice({ message });
  }

  function showTranslatedNotice(key: TranslationKey) {
    setNotice({ key });
  }

  function focusAddForm() {
    const formId = activeView === "inventory" ? "quick-add-form" : "location-form";
    const form = document.getElementById(formId);

    setNotice(null);
    form?.scrollIntoView({ behavior: "smooth", block: "start" });
    form?.querySelector<HTMLInputElement | HTMLSelectElement>("input, select")?.focus();
  }

  if (!token) {
    return (
      <Welcome
        authOpen={authOpen}
        mode={authMode}
        setMode={setAuthMode}
        onStart={() => setAuthOpen(true)}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={authenticate}
      />
    );
  }

  const isLoading = sites.isLoading || places.isLoading || items.isLoading;
  const heading = activeView === "inventory" ? t("everythingInPlace") : t("yourLocations");
  const actionLabel = activeView === "inventory" ? t("addItem") : t("addLocation");

  return (
    <main className="app-shell">
      <AppSidebar
        activeView={activeView}
        onViewChange={changeView}
        onNotice={showTranslatedNotice}
        onSignOut={signOut}
      />
      <section className="workspace" id="top">
        <header className="topbar">
          <div>
            <p className="eyebrow">{t("homeInventory")}</p>
            <h1>{heading}</h1>
          </div>
          <button className="primary-action" onClick={focusAddForm}>
            <CirclePlus size={18} />
            {actionLabel}
          </button>
        </header>
        {notice && (
          <div className="notice" role="status">
            {"key" in notice ? t(notice.key) : notice.message}
            <button aria-label={t("dismissNotice")} onClick={() => setNotice(null)}>
              x
            </button>
          </div>
        )}
        {activeView === "inventory" ? (
          <InventoryView
            isLoading={isLoading}
            items={items.data ?? []}
            places={places.data ?? []}
            sites={sites.data ?? []}
            token={token}
            onSaved={invalidateInventory}
            onNotice={showNotice}
          />
        ) : (
          <LocationsView
            isLoading={sites.isLoading || places.isLoading}
            sites={sites.data ?? []}
            places={places.data ?? []}
            token={token}
            onSaved={invalidateInventory}
            onNotice={showNotice}
          />
        )}
      </section>
    </main>
  );
}

export default App;

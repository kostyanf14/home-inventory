import { useEffect, useState } from "react";
import { CirclePlus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api, logout } from "./api";
import { getAccessToken, setTokens, subscribeToToken, type TokenPair } from "./auth";
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
  const [token, setToken] = useState(getAccessToken);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [activeView, setActiveView] = useState<ActiveView>("inventory");
  const [notice, setNotice] = useState<Notice | null>(null);
  const client = useQueryClient();

  // api() clears the tokens when a refresh cannot save an expired session, so the
  // app must follow the store instead of holding a token that no longer works.
  useEffect(() => subscribeToToken(setToken), []);

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
    void logout().finally(() => {
      client.clear();
      setActiveView("inventory");
    });
  }

  function authenticate(tokens: TokenPair) {
    setTokens(tokens);
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

  function openBarcodeLookup() {
    setActiveView("inventory");
    setNotice({ key: "barcodeReady" });
    window.setTimeout(() => {
      document.getElementById("item-barcode")?.focus();
    }, 0);
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
  const loadError = sites.error ?? places.error ?? items.error;
  const heading = activeView === "inventory" ? t("everythingInPlace") : t("yourLocations");
  const actionLabel = activeView === "inventory" ? t("addItem") : t("addLocation");

  return (
    <main className="app-shell">
      <AppSidebar
        activeView={activeView}
        token={token}
        onViewChange={changeView}
        onNotice={showTranslatedNotice}
        onScanLookup={openBarcodeLookup}
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
        {loadError && (
          <div className="notice" role="alert">
            {loadError.message}
          </div>
        )}
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
            isLoading={sites.isLoading || places.isLoading || items.isLoading}
            sites={sites.data ?? []}
            places={places.data ?? []}
            items={items.data ?? []}
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

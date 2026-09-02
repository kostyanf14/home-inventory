import { useEffect, useState } from "react";
import { CirclePlus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api, logout } from "./api";
import { getAccessToken, setTokens, subscribeToToken, type TokenPair } from "./auth";
import { AppSidebar } from "./components/AppSidebar";
import { InventoryView } from "./components/InventoryView";
import { ItemsView } from "./components/ItemsView";
import { LocationsView } from "./components/LocationsView";
import { MedicinesView } from "./components/MedicinesView";
import { Welcome } from "./components/Welcome";
import { useTranslation } from "./i18n";
import type { TranslationKey } from "./i18n";
import { canonicalPath, pathFromRoute, routeFromPath, type AppRoute, type ItemEditorId } from "./routes";
import type { ActiveView, AuthMode, Item, Place, Site } from "./types";

type Notice = { key: TranslationKey } | { message: string };

function App() {
  const { t } = useTranslation();
  const [token, setToken] = useState(getAccessToken);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [route, setRoute] = useState<AppRoute>(() => routeFromPath(window.location.pathname));
  const [notice, setNotice] = useState<Notice | null>(null);
  const client = useQueryClient();
  const activeView = route.view;

  // api() clears the tokens when a refresh cannot save an expired session, so the
  // app must follow the store instead of holding a token that no longer works.
  useEffect(() => subscribeToToken(setToken), []);

  useEffect(() => {
    const path = window.location.pathname;
    const canonical = canonicalPath(path);
    if (path !== canonical) {
      window.history.replaceState(null, "", canonical);
    }
    setRoute(routeFromPath(canonical));

    function onPopState() {
      setRoute(routeFromPath(window.location.pathname));
      setNotice(null);
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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
    });
  }

  function authenticate(tokens: TokenPair) {
    setTokens(tokens);
    setAuthOpen(false);
  }

  function go(next: AppRoute, nextNotice: Notice | null = null) {
    const path = pathFromRoute(next);
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
    setRoute(next);
    setNotice(nextNotice);
  }

  function changeView(view: ActiveView, nextNotice: Notice | null = null) {
    go({ view }, nextNotice);
  }

  function openItem(itemId?: ItemEditorId) {
    go({ view: "items", itemId });
  }

  function showNotice(message: string) {
    setNotice({ message });
  }

  function showTranslatedNotice(key: TranslationKey) {
    setNotice({ key });
  }

  function openBarcodeLookup() {
    go({ view: "inventory" }, { key: "barcodeReady" });
    window.setTimeout(() => {
      document.getElementById("item-barcode")?.focus();
    }, 0);
  }

  function focusAddForm() {
    if (activeView === "medicines") {
      go({ view: "inventory" });
      window.setTimeout(() => {
        const form = document.getElementById("quick-add-form");
        form?.scrollIntoView({ behavior: "smooth", block: "start" });
        form?.querySelector<HTMLInputElement | HTMLSelectElement>("input, select")?.focus();
      }, 0);
      return;
    }

    if (activeView === "items") {
      go({ view: "items", itemId: "new" });
      window.setTimeout(() => {
        const form = document.getElementById("item-editor-form");
        form?.scrollIntoView({ behavior: "smooth", block: "start" });
        document.getElementById("editor-name")?.focus();
      }, 0);
      return;
    }

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
  const heading =
    activeView === "inventory"
      ? t("everythingInPlace")
      : activeView === "medicines"
        ? t("medicineCabinet")
        : activeView === "items"
          ? t("manageItems")
          : t("yourLocations");
  const actionLabel =
    activeView === "locations" ? t("addLocation") : activeView === "items" ? t("newItem") : t("addItem");

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
            onEditItem={openItem}
          />
        ) : activeView === "medicines" ? (
          <MedicinesView
            isLoading={isLoading}
            items={items.data ?? []}
            places={places.data ?? []}
            sites={sites.data ?? []}
            token={token}
            onSaved={invalidateInventory}
            onNotice={showNotice}
          />
        ) : activeView === "items" ? (
          <ItemsView
            isLoading={isLoading}
            items={items.data ?? []}
            places={places.data ?? []}
            sites={sites.data ?? []}
            selectedId={route.itemId}
            token={token}
            onOpenItem={openItem}
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

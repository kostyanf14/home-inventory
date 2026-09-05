import { FormEvent, ReactNode, useState } from "react";
import {
  Archive,
  Boxes,
  CirclePlus,
  MapPin,
  PackagePlus,
  Pencil,
  Pill,
  Search,
  Trash2,
  Wrench,
} from "lucide-react";

import { api } from "../api";
import { useTranslation } from "../i18n";
import { locationPath } from "../location";
import type { BarcodeLookupResponse, InventoryItemType, Item, Place, Site } from "../types";
import { Empty, Loading } from "./Feedback";

const CATALOG_BARCODE = /^[0-9]{6,14}$/;
const ITEM_TYPES = ["medicine", "equipment", "other"] as const;

function itemTypeFromCategory(category: string | null | undefined): InventoryItemType | null {
  return ITEM_TYPES.find((type) => type === category) ?? null;
}

type InventoryViewProps = {
  isLoading: boolean;
  items: Item[];
  places: Place[];
  sites: Site[];
  token: string;
  onSaved: () => void;
  onNotice: (message: string) => void;
  onEditItem: (id: number) => void;
};

export function InventoryView({
  isLoading,
  items,
  places,
  sites,
  token,
  onSaved,
  onNotice,
  onEditItem,
}: InventoryViewProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<"all" | InventoryItemType>("all");
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const visibleItems = items.filter((item) => {
    if (filter !== "all" && item.item_type !== filter) {
      return false;
    }
    if (!query) {
      return true;
    }
    return (
      item.display_name.toLowerCase().includes(query) ||
      (item.barcode ?? "").toLowerCase().includes(query) ||
      locationPath(item, places, sites).toLowerCase().includes(query)
    );
  });
  const medicineCount = items.filter((item) => item.item_type === "medicine").length;
  const equipmentCount = items.filter((item) => item.item_type === "equipment").length;

  return (
    <>
      <section className="stat-grid" aria-label="Inventory overview">
        <Stat icon={<Boxes />} value={String(items.length)} label={t("totalItems")} tone="sun" />
        <Stat icon={<Pill />} value={String(medicineCount)} label={t("medicines")} tone="mint" />
        <Stat icon={<Wrench />} value={String(equipmentCount)} label={t("equipment")} tone="blue" />
        <Stat icon={<MapPin />} value={String(sites.length)} label={t("sites")} tone="coral" />
      </section>
      <section className="content-grid">
        <section className="panel inventory-panel">
          <div className="panel-heading">
            <div>
              <h2>{t("inventory")}</h2>
              <p>{t("catalogReady")}</p>
            </div>
            <label className="search">
              <Search size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("searchInventory")}
                aria-label={t("searchInventory")}
              />
            </label>
          </div>
          <div className="filter-row">
            <span>{t("show")}</span>
            {(["all", "medicine", "equipment", "other"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={filter === type ? "filter active" : "filter"}
              >
                {type === "all" ? t("allItems") : t(type)}
              </button>
            ))}
          </div>
          {isLoading ? (
            <Loading />
          ) : visibleItems.length ? (
            <ItemTable
              items={visibleItems}
              places={places}
              sites={sites}
              token={token}
              onSaved={onSaved}
              onNotice={onNotice}
              onEditItem={onEditItem}
            />
          ) : query || filter !== "all" ? (
            <Empty title={t("noMatchingItems")} detail={t("noMatchingItemsDetail")} />
          ) : (
            <Empty title={t("yourInventoryIsClear")} detail={t("inventoryEmptyDetail")} />
          )}
        </section>
        <QuickAdd
          token={token}
          sites={sites}
          places={places}
          onSaved={onSaved}
          onNotice={onNotice}
        />
      </section>
    </>
  );
}

type StatProps = {
  icon: ReactNode;
  value: string;
  label: string;
  tone: string;
};

function Stat({ icon, value, label, tone }: StatProps) {
  return (
    <article className={`stat ${tone}`}>
      <span>{icon}</span>
      <strong>{value}</strong>
      <p>{label}</p>
    </article>
  );
}

type ItemTableProps = {
  items: Item[];
  places: Place[];
  sites: Site[];
  token: string;
  onSaved: () => void;
  onNotice: (message: string) => void;
  onEditItem: (id: number) => void;
};

function ItemTable({ items, places, sites, token, onSaved, onNotice, onEditItem }: ItemTableProps) {
  const { t } = useTranslation();
  const [removingId, setRemovingId] = useState<number | null>(null);

  async function remove(item: Item) {
    if (!window.confirm(t("confirmDeleteItem", { name: item.display_name }))) {
      return;
    }

    setRemovingId(item.id);
    try {
      await api(`/inventory-items/${item.id}`, token, { method: "DELETE" });
      onSaved();
      onNotice(t("itemDeleted"));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : t("unableToDeleteItem"));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t("item")}</th>
            <th>{t("location")}</th>
            <th>{t("quantity")}</th>
            <th>{t("status")}</th>
            <th>
              <span className="visually-hidden">{t("deleteItem")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <div className="item-cell">
                  <span className={`item-icon ${item.item_type}`}>
                    {item.item_type === "medicine" ? (
                      <Pill size={16} />
                    ) : item.item_type === "equipment" ? (
                      <Wrench size={16} />
                    ) : (
                      <Archive size={16} />
                    )}
                  </span>
                  <div>
                    <strong>{item.display_name}</strong>
                    {item.barcode && <small>{item.barcode}</small>}
                    {item.medicine_details && (
                      <small>
                        {t("expires")} {item.medicine_details.expiration_date}
                      </small>
                    )}
                    {item.equipment_details?.warranty_expiration_date && (
                      <small>
                        {t("warrantyEnds")} {item.equipment_details.warranty_expiration_date}
                      </small>
                    )}
                  </div>
                </div>
              </td>
              <td data-label={t("location")}>
                {locationPath(item, places, sites) || t("unassigned")}
              </td>
              <td data-label={t("quantity")}>
                {item.quantity} {item.unit}
              </td>
              <td data-label={t("status")}>
                <span className="status">{item.status}</span>
              </td>
              <td className="actions-cell">
                <div className="item-actions">
                  <button
                    type="button"
                    className="edit"
                    aria-label={t("editItemNamed", { name: item.display_name })}
                    title={t("editItemNamed", { name: item.display_name })}
                    onClick={() => onEditItem(item.id)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="danger"
                    aria-label={t("deleteItemNamed", { name: item.display_name })}
                    title={t("deleteItemNamed", { name: item.display_name })}
                    disabled={removingId === item.id}
                    onClick={() => void remove(item)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type QuickAddProps = {
  token: string;
  sites: Site[];
  places: Place[];
  onSaved: () => void;
  onNotice: (message: string) => void;
};

type LookupState =
  | { kind: "idle" }
  | { kind: "invalid" }
  | { kind: "looking" }
  | { kind: "found"; name: string }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

function QuickAdd({ token, sites, places, onSaved, onNotice }: QuickAddProps) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<InventoryItemType>("other");
  const [siteId, setSiteId] = useState("");
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [productId, setProductId] = useState<number | null>(null);
  const [lookup, setLookup] = useState<LookupState>({ kind: "idle" });
  const sitePlaces = places.filter((place) => String(place.site_id) === siteId);
  const catalogBarcode = CATALOG_BARCODE.test(barcode);

  function changeBarcode(value: string) {
    setBarcode(value.replace(/\D/g, "").slice(0, 14));
    setProductId(null);
    setLookup({ kind: "idle" });
  }

  async function lookUpBarcode() {
    if (!catalogBarcode) {
      setLookup({ kind: "invalid" });
      return;
    }

    setLookup({ kind: "looking" });
    try {
      const result = await api<BarcodeLookupResponse>("/barcode/lookup", token, {
        method: "POST",
        body: JSON.stringify({ barcode, local_only: true }),
      });
      if (result.found && result.product) {
        setName(result.product.name);
        if (result.product.default_unit) {
          setUnit(result.product.default_unit);
        }
        const catalogType = itemTypeFromCategory(result.product.category);
        if (catalogType) {
          setKind(catalogType);
        }
        setProductId(typeof result.product.id === "number" ? result.product.id : null);
        setLookup({ kind: "found", name: result.product.name });
        return;
      }
      setProductId(null);
      setLookup({ kind: "not_found" });
    } catch (error) {
      setLookup({
        kind: "error",
        message: error instanceof Error ? error.message : t("barcodeLookupFailed"),
      });
    }
  }

  function lookupMessage(): string | null {
    switch (lookup.kind) {
      case "idle":
        return barcode ? t("barcodeLookupHint") : null;
      case "invalid":
        return t("barcodeLookupInvalid");
      case "looking":
        return t("barcodeLookingUp");
      case "found":
        return t("barcodeFound", { name: lookup.name });
      case "not_found":
        return t("barcodeNotFound");
      case "error":
        return lookup.message;
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!sites.length || !places.length) {
      onNotice(t("createSiteAndPlace"));
      return;
    }

    const formElement = event.currentTarget;
    const data = new FormData(formElement);
    const buyDate = String(data.get("buy_date") ?? "");
    const warrantyExpirationDate = String(data.get("warranty_expiration_date") ?? "");

    try {
      await api("/inventory-items", token, {
        method: "POST",
        body: JSON.stringify({
          display_name: name,
          item_type: kind,
          quantity: Number(data.get("quantity")),
          unit,
          site_id: Number(data.get("site")),
          place_id: Number(data.get("place")),
          ...(barcode ? { barcode } : {}),
          ...(productId ? { product_id: productId } : {}),
          ...(kind === "medicine"
            ? { medicine_details: { expiration_date: data.get("expiration") } }
            : {}),
          ...(kind === "equipment"
            ? {
                equipment_details: {
                  ...(buyDate ? { buy_date: buyDate } : {}),
                  ...(warrantyExpirationDate
                    ? { warranty_expiration_date: warrantyExpirationDate }
                    : {}),
                },
              }
            : {}),
        }),
      });
      formElement.reset();
      setSiteId("");
      setName("");
      setBarcode("");
      setUnit("pcs");
      setKind("other");
      setProductId(null);
      setLookup({ kind: "idle" });
      onSaved();
      onNotice(t("itemAdded"));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : t("unableToAddItem"));
    }
  }

  return (
    <form className="panel quick-add" id="quick-add-form" onSubmit={submit}>
      <div className="panel-heading">
        <div>
          <h2>{t("quickAdd")}</h2>
          <p>{t("captureIt")}</p>
        </div>
        <PackagePlus size={20} />
      </div>
      <div className="barcode-row">
        <label className="barcode-caption" htmlFor="item-barcode">
          {t("barcode")}
        </label>
        <input
          id="item-barcode"
          name="barcode"
          inputMode="numeric"
          autoComplete="off"
          value={barcode}
          onChange={(event) => changeBarcode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void lookUpBarcode();
            }
          }}
          placeholder={t("barcodePlaceholder")}
          aria-describedby="barcode-lookup-hint"
        />
        <button
          type="button"
          className="secondary-action"
          onClick={() => void lookUpBarcode()}
          disabled={lookup.kind === "looking"}
        >
          {t("lookUpBarcode")}
        </button>
      </div>
      <p className="lookup-hint" id="barcode-lookup-hint" aria-live="polite">
        {lookupMessage() ?? t("barcodeLookupHint")}
      </p>
      <label>
        {t("itemName")}
        <input
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("itemNamePlaceholder")}
          required
        />
      </label>
      <div className="kind-selector">
        {(["other", "medicine", "equipment"] as const).map((value) => (
          <button
            type="button"
            className={kind === value ? "active" : ""}
            onClick={() => setKind(value)}
            key={value}
          >
            {t(value)}
          </button>
        ))}
      </div>
      <label>
        {t("site")}
        <select
          name="site"
          required
          value={siteId}
          onChange={(event) => setSiteId(event.target.value)}
        >
          <option value="" disabled>
            {t("selectSite")}
          </option>
          {sites.map((site) => (
            <option value={site.id} key={site.id}>
              {site.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("places")}
        <select name="place" required defaultValue="" disabled={!siteId}>
          <option value="" disabled>
            {siteId && !sitePlaces.length ? t("noPlacesInSite") : t("selectPlace")}
          </option>
          {sitePlaces.map((place) => (
            <option value={place.id} key={place.id}>
              {place.name}
            </option>
          ))}
        </select>
      </label>
      <div className="field-pair">
        <label>
          {t("quantity")}
          <input name="quantity" type="number" defaultValue="1" min="0" step="0.5" required />
        </label>
        <label>
          {t("unit")}
          <input
            name="unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            required
          />
        </label>
      </div>
      {kind === "medicine" && (
        <label>
          {t("expirationDate")}
          <input name="expiration" type="date" required />
        </label>
      )}
      {kind === "equipment" && (
        <div className="field-pair">
          <label>
            {t("buyDate")}
            <input name="buy_date" type="date" />
          </label>
          <label>
            {t("warrantyExpirationDate")}
            <input name="warranty_expiration_date" type="date" />
          </label>
        </div>
      )}
      <button className="primary-action">
        <CirclePlus size={17} />
        {t("addToInventory")}
      </button>
    </form>
  );
}

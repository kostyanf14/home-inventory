import { FormEvent, ReactNode, useState } from "react";
import {
  Archive,
  Boxes,
  CirclePlus,
  MapPin,
  PackagePlus,
  Pill,
  Search,
  Wrench,
} from "lucide-react";

import { api } from "../api";
import { useTranslation } from "../i18n";
import type { InventoryItemType, Item, Place, Site } from "../types";
import { Empty, Loading } from "./Feedback";

type InventoryViewProps = {
  isLoading: boolean;
  items: Item[];
  places: Place[];
  sites: Site[];
  token: string;
  onSaved: () => void;
  onNotice: (message: string) => void;
};

export function InventoryView({
  isLoading,
  items,
  places,
  sites,
  token,
  onSaved,
  onNotice,
}: InventoryViewProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<"all" | InventoryItemType>("all");
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const placeName = (placeId: number) =>
    places.find((place) => place.id === placeId)?.name.toLowerCase() ?? "";
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
      placeName(item.place_id).includes(query)
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
            <ItemTable items={visibleItems} places={places} />
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
};

function ItemTable({ items, places }: ItemTableProps) {
  const { t } = useTranslation();

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t("item")}</th>
            <th>{t("location")}</th>
            <th>{t("quantity")}</th>
            <th>{t("status")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <span className={`item-icon ${item.item_type}`}>
                  {item.item_type === "medicine" ? (
                    <Pill size={16} />
                  ) : item.item_type === "equipment" ? (
                    <Wrench size={16} />
                  ) : (
                    <Archive size={16} />
                  )}
                </span>
                <strong>{item.display_name}</strong>
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
              </td>
              <td>{places.find((place) => place.id === item.place_id)?.name ?? t("unassigned")}</td>
              <td>
                {item.quantity} {item.unit}
              </td>
              <td>
                <span className="status">{item.status}</span>
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

function QuickAdd({ token, sites, places, onSaved, onNotice }: QuickAddProps) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<InventoryItemType>("other");
  const [siteId, setSiteId] = useState("");
  const sitePlaces = places.filter((place) => String(place.site_id) === siteId);

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
          display_name: data.get("name"),
          item_type: kind,
          quantity: Number(data.get("quantity")),
          unit: data.get("unit"),
          site_id: Number(data.get("site")),
          place_id: Number(data.get("place")),
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
      <label>
        {t("itemName")}
        <input name="name" placeholder={t("itemNamePlaceholder")} required />
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
          <input name="unit" defaultValue="pcs" required />
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

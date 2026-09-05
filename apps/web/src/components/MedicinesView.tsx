import { useMemo, useState } from "react";
import { CookingPot, Pill, Trash2 } from "lucide-react";

import { api } from "../api";
import { useTranslation } from "../i18n";
import { isExpiredConsumable, locationKey, locationPath, todayIsoDate } from "../location";
import type { InventoryItemType, Item, Place, Site } from "../types";
import { Empty, Loading } from "./Feedback";

type ConsumableKind = Extract<InventoryItemType, "medicine" | "food">;

type ConsumablesViewProps = {
  kind: ConsumableKind;
  isLoading: boolean;
  items: Item[];
  places: Place[];
  sites: Site[];
  token: string;
  onSaved: () => void;
  onNotice: (message: string) => void;
};

export function MedicinesView(props: Omit<ConsumablesViewProps, "kind">) {
  return <ConsumablesView kind="medicine" {...props} />;
}

export function FoodsView(props: Omit<ConsumablesViewProps, "kind">) {
  return <ConsumablesView kind="food" {...props} />;
}

function ConsumablesView({
  kind,
  isLoading,
  items,
  places,
  sites,
  token,
  onSaved,
  onNotice,
}: ConsumablesViewProps) {
  const { t } = useTranslation();
  const [locationFilter, setLocationFilter] = useState("");
  const [expiredOnly, setExpiredOnly] = useState(false);
  const [usingId, setUsingId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [deletingFiltered, setDeletingFiltered] = useState(false);
  const busy = usingId !== null || removingId !== null || deletingFiltered;
  const today = todayIsoDate();
  const consumables = items.filter((item) => item.item_type === kind);
  const locationOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) {
      if (item.item_type !== kind) {
        continue;
      }
      const key = locationKey(item, places);
      const label = locationPath(item, places, sites);
      if (key && label && !seen.has(key)) {
        seen.set(key, label);
      }
    }
    return [...seen.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [items, kind, places, sites]);

  const visible = consumables.filter((item) => {
    if (locationFilter && locationKey(item, places) !== locationFilter) {
      return false;
    }
    if (expiredOnly && !isExpiredConsumable(item, today)) {
      return false;
    }
    return true;
  });
  const expiredCount = consumables.filter((item) => isExpiredConsumable(item, today)).length;

  async function takeDose(item: Item) {
    setUsingId(item.id);
    try {
      await api(`/inventory-items/${item.id}/use`, token, { method: "POST" });
      onSaved();
      onNotice(t("medicineUsed", { name: item.display_name }));
    } catch (error) {
      onNotice(
        error instanceof Error
          ? error.message
          : kind === "food"
            ? t("unableToUseFood")
            : t("unableToUseMedicine")
      );
    } finally {
      setUsingId(null);
    }
  }

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

  async function removeFiltered() {
    if (!visible.length) {
      return;
    }
    if (
      !window.confirm(
        kind === "food"
          ? t("confirmDeleteFilteredFood", { count: visible.length })
          : t("confirmDeleteFiltered", { count: visible.length })
      )
    ) {
      return;
    }

    setDeletingFiltered(true);
    const ids = visible.map((item) => item.id);
    let removed = 0;
    try {
      for (const id of ids) {
        await api(`/inventory-items/${id}`, token, { method: "DELETE" });
        removed += 1;
      }
      onSaved();
      onNotice(
        kind === "food"
          ? t("filteredFoodDeleted", { count: removed })
          : t("filteredMedicinesDeleted", { count: removed })
      );
    } catch (error) {
      onSaved();
      onNotice(
        removed
          ? kind === "food"
            ? t("filteredFoodPartiallyDeleted", { removed, total: ids.length })
            : t("filteredMedicinesPartiallyDeleted", { removed, total: ids.length })
          : error instanceof Error
            ? error.message
            : kind === "food"
              ? t("unableToDeleteFilteredFood")
              : t("unableToDeleteFiltered")
      );
    } finally {
      setDeletingFiltered(false);
    }
  }

  return (
    <section className="panel inventory-panel">
      <div className="panel-heading">
        <div>
          <h2>{kind === "food" ? t("food") : t("medicines")}</h2>
          <p>{kind === "food" ? t("foodCabinetIntro") : t("medicineCabinetIntro")}</p>
        </div>
        <p className="medicine-counts">
          {consumables.length} {kind === "food" ? t("food") : t("medicines")}
          {expiredCount ? ` · ${expiredCount} ${t("expiredCount")}` : ""}
        </p>
      </div>
      <div className="filter-row medicine-filters">
        <label>
          {t("filterLocation")}
          <select
            value={locationFilter}
            onChange={(event) => setLocationFilter(event.target.value)}
            aria-label={t("filterLocation")}
          >
            <option value="">{t("allLocations")}</option>
            {locationOptions.map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="check-filter">
          <input
            type="checkbox"
            checked={expiredOnly}
            onChange={(event) => setExpiredOnly(event.target.checked)}
          />
          {t("expiredOnly")}
        </label>
        <button
          type="button"
          className="danger-text"
          disabled={!visible.length || busy}
          onClick={() => void removeFiltered()}
        >
          {t("deleteFiltered", { count: visible.length })}
        </button>
      </div>
      {isLoading ? (
        <Loading />
      ) : visible.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("item")}</th>
                <th>{t("location")}</th>
                <th>{t("quantity")}</th>
                <th>{t("expirationDate")}</th>
                <th>
                  <span className="visually-hidden">{t("useOne")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const expired = isExpiredConsumable(item, today);
                const path = locationPath(item, places, sites);
                const expiration =
                  kind === "food"
                    ? item.food_details?.expiration_date
                    : item.medicine_details?.expiration_date;
                return (
                  <tr key={item.id} className={expired ? "expired-row" : undefined}>
                    <td>
                      <div className="item-cell">
                        <span className={`item-icon ${kind}`}>
                          {kind === "food" ? <CookingPot size={16} /> : <Pill size={16} />}
                        </span>
                        <div>
                          <strong>{item.display_name}</strong>
                          {expired && <small>{t("expired")}</small>}
                        </div>
                      </div>
                    </td>
                    <td data-label={t("location")}>{path || t("unassigned")}</td>
                    <td data-label={t("quantity")}>
                      {item.quantity} {item.unit}
                    </td>
                    <td data-label={t("expirationDate")}>{expiration ?? "—"}</td>
                    <td className="actions-cell">
                      <div className="medicine-row-actions">
                        <button
                          type="button"
                          className="use-action"
                          aria-label={t("useOneNamed", { name: item.display_name })}
                          disabled={item.quantity < 1 || busy}
                          onClick={() => void takeDose(item)}
                        >
                          {t("useOne")}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          aria-label={t("deleteItemNamed", { name: item.display_name })}
                          title={t("deleteItemNamed", { name: item.display_name })}
                          disabled={busy}
                          onClick={() => void remove(item)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : consumables.length && (locationFilter || expiredOnly) ? (
        <Empty
          title={kind === "food" ? t("noMatchingFoods") : t("noMatchingMedicines")}
          detail={kind === "food" ? t("noMatchingFoodsDetail") : t("noMatchingMedicinesDetail")}
        />
      ) : (
        <Empty
          title={kind === "food" ? t("noFoods") : t("noMedicines")}
          detail={kind === "food" ? t("noFoodsDetail") : t("noMedicinesDetail")}
        />
      )}
    </section>
  );
}

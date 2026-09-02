import { useMemo, useState } from "react";
import { Pill, Trash2 } from "lucide-react";

import { api } from "../api";
import { useTranslation } from "../i18n";
import { isExpiredMedicine, locationKey, locationPath, todayIsoDate } from "../location";
import type { Item, Place, Site } from "../types";
import { Empty, Loading } from "./Feedback";

type MedicinesViewProps = {
  isLoading: boolean;
  items: Item[];
  places: Place[];
  sites: Site[];
  token: string;
  onSaved: () => void;
  onNotice: (message: string) => void;
};

export function MedicinesView({
  isLoading,
  items,
  places,
  sites,
  token,
  onSaved,
  onNotice,
}: MedicinesViewProps) {
  const { t } = useTranslation();
  const [locationFilter, setLocationFilter] = useState("");
  const [expiredOnly, setExpiredOnly] = useState(false);
  const [usingId, setUsingId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [deletingFiltered, setDeletingFiltered] = useState(false);
  const busy = usingId !== null || removingId !== null || deletingFiltered;
  const today = todayIsoDate();
  const medicines = items.filter((item) => item.item_type === "medicine");
  const locationOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) {
      if (item.item_type !== "medicine") {
        continue;
      }
      const key = locationKey(item, places);
      const label = locationPath(item, places, sites);
      if (key && label && !seen.has(key)) {
        seen.set(key, label);
      }
    }
    return [...seen.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [items, places, sites]);

  const visible = medicines.filter((item) => {
    if (locationFilter && locationKey(item, places) !== locationFilter) {
      return false;
    }
    if (expiredOnly && !isExpiredMedicine(item, today)) {
      return false;
    }
    return true;
  });
  const expiredCount = medicines.filter((item) => isExpiredMedicine(item, today)).length;

  async function takeDose(item: Item) {
    setUsingId(item.id);
    try {
      await api(`/inventory-items/${item.id}/use`, token, { method: "POST" });
      onSaved();
      onNotice(t("medicineUsed", { name: item.display_name }));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : t("unableToUseMedicine"));
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
    if (!window.confirm(t("confirmDeleteFiltered", { count: visible.length }))) {
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
      onNotice(t("filteredMedicinesDeleted", { count: removed }));
    } catch (error) {
      onSaved();
      onNotice(
        removed
          ? t("filteredMedicinesPartiallyDeleted", { removed, total: ids.length })
          : error instanceof Error
            ? error.message
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
          <h2>{t("medicines")}</h2>
          <p>{t("medicineCabinetIntro")}</p>
        </div>
        <p className="medicine-counts">
          {medicines.length} {t("medicines")}
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
          <table>
            <thead>
              <tr>
                <th>{t("item")}</th>
                <th>{t("location")}</th>
                <th>{t("quantity")}</th>
                <th>{t("expirationDate")}</th>
                <th>
                  <span className="visually-hidden">{t("useOne")}</span>
                </th>
                <th>
                  <span className="visually-hidden">{t("deleteItem")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const expired = isExpiredMedicine(item, today);
                const path = locationPath(item, places, sites);
                return (
                  <tr key={item.id} className={expired ? "expired-row" : undefined}>
                    <td>
                      <span className="item-icon medicine">
                        <Pill size={16} />
                      </span>
                      <strong>{item.display_name}</strong>
                      {expired && <small>{t("expired")}</small>}
                    </td>
                    <td>{path || t("unassigned")}</td>
                    <td>
                      {item.quantity} {item.unit}
                    </td>
                    <td>{item.medicine_details?.expiration_date ?? "—"}</td>
                    <td>
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
      ) : medicines.length && (locationFilter || expiredOnly) ? (
        <Empty title={t("noMatchingMedicines")} detail={t("noMatchingMedicinesDetail")} />
      ) : (
        <Empty title={t("noMedicines")} detail={t("noMedicinesDetail")} />
      )}
    </section>
  );
}

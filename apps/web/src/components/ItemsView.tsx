import { FormEvent, useEffect, useRef, useState } from "react";
import { CirclePlus, Pencil, SquarePen, Trash2 } from "lucide-react";

import { api } from "../api";
import { useTranslation } from "../i18n";
import { locationPath } from "../location";
import type { ItemEditorId } from "../routes";
import {
  ITEM_STATUSES,
  ITEM_TYPES,
  type InventoryItemType,
  type Item,
  type ItemStatus,
  type Place,
  type Site,
} from "../types";
import { Empty, Loading } from "./Feedback";

type ItemsViewProps = {
  isLoading: boolean;
  items: Item[];
  places: Place[];
  sites: Site[];
  selectedId?: ItemEditorId;
  token: string;
  onOpenItem: (id?: ItemEditorId) => void;
  onSaved: () => void;
  onNotice: (message: string) => void;
};

type EditorState = {
  displayName: string;
  itemType: InventoryItemType;
  status: ItemStatus;
  siteId: string;
  placeId: string;
  quantity: string;
  unit: string;
  barcode: string;
  productId: string;
  notes: string;
  photoUrl: string;
  expirationDate: string;
  dosage: string;
  form: string;
  requiresPrescription: boolean;
  batchNumber: string;
  serialNumber: string;
  buyDate: string;
  warrantyExpirationDate: string;
  modelNumber: string;
  vendorName: string;
  receiptFileUrl: string;
};

function blankEditor(): EditorState {
  return {
    displayName: "",
    itemType: "other",
    status: "active",
    siteId: "",
    placeId: "",
    quantity: "1",
    unit: "pcs",
    barcode: "",
    productId: "",
    notes: "",
    photoUrl: "",
    expirationDate: "",
    dosage: "",
    form: "",
    requiresPrescription: false,
    batchNumber: "",
    serialNumber: "",
    buyDate: "",
    warrantyExpirationDate: "",
    modelNumber: "",
    vendorName: "",
    receiptFileUrl: "",
  };
}

function editorFromItem(item: Item): EditorState {
  return {
    displayName: item.display_name,
    itemType: item.item_type,
    status: ITEM_STATUSES.includes(item.status as ItemStatus)
      ? (item.status as ItemStatus)
      : "active",
    siteId: item.site_id ? String(item.site_id) : "",
    placeId: String(item.place_id),
    quantity: String(item.quantity),
    unit: item.unit,
    barcode: item.barcode ?? "",
    productId: item.product_id ? String(item.product_id) : "",
    notes: item.notes ?? "",
    photoUrl: item.photo_url ?? "",
    expirationDate: item.medicine_details?.expiration_date ?? "",
    dosage: item.medicine_details?.dosage ?? "",
    form: item.medicine_details?.form ?? "",
    requiresPrescription: Boolean(item.medicine_details?.requires_prescription),
    batchNumber: item.medicine_details?.batch_number ?? "",
    serialNumber: item.equipment_details?.serial_number ?? "",
    buyDate: item.equipment_details?.buy_date ?? "",
    warrantyExpirationDate: item.equipment_details?.warranty_expiration_date ?? "",
    modelNumber: item.equipment_details?.model_number ?? "",
    vendorName: item.equipment_details?.vendor_name ?? "",
    receiptFileUrl: item.equipment_details?.receipt_file_url ?? "",
  };
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function ItemsView({
  isLoading,
  items,
  places,
  sites,
  selectedId,
  token,
  onOpenItem,
  onSaved,
  onNotice,
}: ItemsViewProps) {
  const { t } = useTranslation();
  const [editor, setEditor] = useState(blankEditor);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const loadedForId = useRef<ItemEditorId | "list" | null>(null);
  const editingItem =
    typeof selectedId === "number" ? items.find((item) => item.id === selectedId) : undefined;
  const isCreate = selectedId === "new" || selectedId == null;
  const sitePlaces = places.filter((place) => String(place.site_id) === editor.siteId);

  useEffect(() => {
    if (typeof selectedId === "number") {
      const item = items.find((entry) => entry.id === selectedId);
      if (item && loadedForId.current !== selectedId) {
        setEditor(editorFromItem(item));
        loadedForId.current = selectedId;
      }
      return;
    }
    const key = selectedId === "new" ? "new" : "list";
    if (loadedForId.current !== key) {
      setEditor(blankEditor());
      loadedForId.current = key;
    }
  }, [items, selectedId]);

  function patchEditor<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setEditor((current) => ({ ...current, [key]: value }));
  }

  function changeSite(siteId: string) {
    setEditor((current) => ({ ...current, siteId, placeId: "" }));
  }

  function payload() {
    const body: Record<string, unknown> = {
      display_name: editor.displayName.trim(),
      item_type: editor.itemType,
      status: editor.status,
      quantity: Number(editor.quantity),
      unit: editor.unit.trim() || "pcs",
      site_id: Number(editor.siteId),
      place_id: Number(editor.placeId),
      barcode: optionalText(editor.barcode),
      product_id: editor.productId.trim() ? Number(editor.productId) : null,
      notes: optionalText(editor.notes),
      photo_url: optionalText(editor.photoUrl),
    };
    if (editor.itemType === "medicine") {
      body.medicine_details = {
        expiration_date: editor.expirationDate,
        dosage: optionalText(editor.dosage),
        form: optionalText(editor.form),
        requires_prescription: editor.requiresPrescription,
        batch_number: optionalText(editor.batchNumber),
      };
    }
    if (editor.itemType === "equipment") {
      body.equipment_details = {
        serial_number: optionalText(editor.serialNumber),
        buy_date: optionalText(editor.buyDate),
        warranty_expiration_date: optionalText(editor.warrantyExpirationDate),
        model_number: optionalText(editor.modelNumber),
        vendor_name: optionalText(editor.vendorName),
        receipt_file_url: optionalText(editor.receiptFileUrl),
      };
    }
    return body;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sites.length || !places.length) {
      onNotice(t("createSiteAndPlace"));
      return;
    }

    setSaving(true);
    try {
      if (typeof selectedId === "number") {
        await api(`/inventory-items/${selectedId}`, token, {
          method: "PATCH",
          body: JSON.stringify(payload()),
        });
      } else {
        const created = await api<Item>("/inventory-items", token, {
          method: "POST",
          body: JSON.stringify(payload()),
        });
        onOpenItem(created.id);
      }
      onSaved();
      onNotice(t("itemSaved"));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : t("unableToSaveItem"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (typeof selectedId !== "number" || !editingItem) {
      return;
    }
    if (!window.confirm(t("confirmDeleteItem", { name: editingItem.display_name }))) {
      return;
    }
    setRemoving(true);
    try {
      await api(`/inventory-items/${selectedId}`, token, { method: "DELETE" });
      onSaved();
      onOpenItem();
      onNotice(t("itemDeleted"));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : t("unableToDeleteItem"));
    } finally {
      setRemoving(false);
    }
  }

  const formTitle =
    typeof selectedId === "number"
      ? t("editingItem", { name: editingItem?.display_name ?? `#${selectedId}` })
      : t("newItem");

  return (
    <section className="content-grid">
      <section className="panel inventory-panel">
        <div className="panel-heading">
          <div>
            <h2>{t("items")}</h2>
            <p>{t("itemsIntro")}</p>
          </div>
        </div>
        {isLoading ? (
          <Loading />
        ) : items.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("item")}</th>
                  <th>{t("location")}</th>
                  <th>{t("status")}</th>
                  <th>
                    <span className="visually-hidden">{t("editItemNamed", { name: "" })}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className={item.id === selectedId ? "selected-item-row" : undefined}
                  >
                    <td>
                      <strong>{item.display_name}</strong>
                      <small>{t(item.item_type)}</small>
                    </td>
                    <td data-label={t("location")}>
                      {locationPath(item, places, sites) || t("unassigned")}
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
                          onClick={() => onOpenItem(item.id)}
                        >
                          <Pencil size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={t("noItemsToEdit")} detail={t("noItemsToEditDetail")} />
        )}
      </section>
      <form
        className="panel quick-add"
        id="item-editor-form"
        onSubmit={(event) => void submit(event)}
      >
        <div className="panel-heading">
          <div>
            <h2>{formTitle}</h2>
            <p>{isCreate ? t("captureIt") : t("saveChanges")}</p>
          </div>
          <SquarePen size={20} />
        </div>
        <label>
          {t("itemName")}
          <input
            id="editor-name"
            value={editor.displayName}
            onChange={(event) => patchEditor("displayName", event.target.value)}
            required
          />
        </label>
        <div className="kind-selector">
          {ITEM_TYPES.map((value) => (
            <button
              type="button"
              className={editor.itemType === value ? "active" : ""}
              onClick={() => patchEditor("itemType", value)}
              key={value}
            >
              {t(value)}
            </button>
          ))}
        </div>
        <label>
          {t("status")}
          <select
            value={editor.status}
            onChange={(event) => patchEditor("status", event.target.value as ItemStatus)}
          >
            {ITEM_STATUSES.map((status) => (
              <option value={status} key={status}>
                {status === "active"
                  ? t("statusActive")
                  : status === "used"
                    ? t("statusUsed")
                    : status === "disposed"
                      ? t("statusDisposed")
                      : t("statusMissing")}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("site")}
          <select
            required
            value={editor.siteId}
            onChange={(event) => changeSite(event.target.value)}
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
          <select
            required
            value={editor.placeId}
            disabled={!editor.siteId}
            onChange={(event) => patchEditor("placeId", event.target.value)}
          >
            <option value="" disabled>
              {editor.siteId && !sitePlaces.length ? t("noPlacesInSite") : t("selectPlace")}
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
            <input
              type="number"
              min="0"
              step="0.5"
              required
              value={editor.quantity}
              onChange={(event) => patchEditor("quantity", event.target.value)}
            />
          </label>
          <label>
            {t("unit")}
            <input
              required
              value={editor.unit}
              onChange={(event) => patchEditor("unit", event.target.value)}
            />
          </label>
        </div>
        <label>
          {t("barcode")}
          <input
            inputMode="numeric"
            autoComplete="off"
            value={editor.barcode}
            onChange={(event) => patchEditor("barcode", event.target.value)}
          />
        </label>
        <label>
          {t("productId")}
          <input
            type="number"
            min="1"
            value={editor.productId}
            onChange={(event) => patchEditor("productId", event.target.value)}
          />
          <span className="field-hint">{t("productIdHint")}</span>
        </label>
        <label>
          {t("photoUrl")}
          <input
            type="url"
            value={editor.photoUrl}
            onChange={(event) => patchEditor("photoUrl", event.target.value)}
          />
        </label>
        <label>
          {t("notes")}
          <textarea
            rows={3}
            value={editor.notes}
            onChange={(event) => patchEditor("notes", event.target.value)}
          />
        </label>
        {editor.itemType === "medicine" && (
          <>
            <label>
              {t("expirationDate")}
              <input
                type="date"
                required
                value={editor.expirationDate}
                onChange={(event) => patchEditor("expirationDate", event.target.value)}
              />
            </label>
            <div className="field-pair">
              <label>
                {t("dosage")}
                <input
                  value={editor.dosage}
                  onChange={(event) => patchEditor("dosage", event.target.value)}
                />
              </label>
              <label>
                {t("form")}
                <input
                  value={editor.form}
                  onChange={(event) => patchEditor("form", event.target.value)}
                />
              </label>
            </div>
            <label>
              {t("batchNumber")}
              <input
                value={editor.batchNumber}
                onChange={(event) => patchEditor("batchNumber", event.target.value)}
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={editor.requiresPrescription}
                onChange={(event) => patchEditor("requiresPrescription", event.target.checked)}
              />
              {t("requiresPrescription")}
            </label>
          </>
        )}
        {editor.itemType === "equipment" && (
          <>
            <div className="field-pair">
              <label>
                {t("buyDate")}
                <input
                  type="date"
                  value={editor.buyDate}
                  onChange={(event) => patchEditor("buyDate", event.target.value)}
                />
              </label>
              <label>
                {t("warrantyExpirationDate")}
                <input
                  type="date"
                  value={editor.warrantyExpirationDate}
                  onChange={(event) => patchEditor("warrantyExpirationDate", event.target.value)}
                />
              </label>
            </div>
            <label>
              {t("serialNumber")}
              <input
                value={editor.serialNumber}
                onChange={(event) => patchEditor("serialNumber", event.target.value)}
              />
            </label>
            <label>
              {t("modelNumber")}
              <input
                value={editor.modelNumber}
                onChange={(event) => patchEditor("modelNumber", event.target.value)}
              />
            </label>
            <label>
              {t("vendorName")}
              <input
                value={editor.vendorName}
                onChange={(event) => patchEditor("vendorName", event.target.value)}
              />
            </label>
            <label>
              {t("receiptFileUrl")}
              <input
                type="url"
                value={editor.receiptFileUrl}
                onChange={(event) => patchEditor("receiptFileUrl", event.target.value)}
              />
            </label>
          </>
        )}
        <div className="editor-actions">
          <button className="primary-action" disabled={saving}>
            <CirclePlus size={17} />
            {typeof selectedId === "number" ? t("saveChanges") : t("createItem")}
          </button>
          {typeof selectedId === "number" && (
            <button
              type="button"
              className="danger-text"
              disabled={removing}
              onClick={() => void remove()}
            >
              <Trash2 size={16} />
              {t("deleteItem")}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

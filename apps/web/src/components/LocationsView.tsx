import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Check, CirclePlus, House, MapPin, Pencil, Trash2, X } from "lucide-react";

import { api } from "../api";
import { useTranslation } from "../i18n";
import type { Item, Place, Site } from "../types";
import { Empty, Loading } from "./Feedback";

type LocationsViewProps = {
  isLoading: boolean;
  sites: Site[];
  places: Place[];
  items: Item[];
  token: string;
  onSaved: () => void;
  onNotice: (message: string) => void;
};

export function LocationsView({
  isLoading,
  sites,
  places,
  items,
  token,
  onSaved,
  onNotice,
}: LocationsViewProps) {
  const { t } = useTranslation();
  return (
    <section className="content-grid">
      <section className="panel location-panel">
        <div className="panel-heading">
          <div>
            <h2>{t("places")}</h2>
            <p>{t("locationIntro")}</p>
          </div>
        </div>
        {isLoading ? (
          <Loading />
        ) : (
          <LocationList
            sites={sites}
            places={places}
            items={items}
            token={token}
            onSaved={onSaved}
            onNotice={onNotice}
          />
        )}
      </section>
      <LocationForm token={token} sites={sites} onSaved={onSaved} onNotice={onNotice} />
    </section>
  );
}

type LocationListProps = {
  sites: Site[];
  places: Place[];
  items: Item[];
  token: string;
  onSaved: () => void;
  onNotice: (message: string) => void;
};

type EditableLocation = { kind: "site"; location: Site } | { kind: "place"; location: Place };

function LocationList({ sites, places, items, token, onSaved, onNotice }: LocationListProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<EditableLocation | null>(null);

  function sitePlaces(siteId: number) {
    return places.filter((place) => place.site_id === siteId);
  }

  function siteItemCount(siteId: number) {
    const placeIds = new Set(sitePlaces(siteId).map((place) => place.id));
    return items.filter((item) => placeIds.has(item.place_id)).length;
  }

  function placeItemCount(placeId: number) {
    return items.filter((item) => item.place_id === placeId).length;
  }

  if (!sites.length) {
    return <Empty title={t("startWithSite")} detail={t("startWithSiteDetail")} />;
  }

  return (
    <div className="location-list">
      {sites.map((site) => (
        <div className="location-group" key={site.id}>
          <LocationRow
            icon={<House size={20} />}
            location={site}
            kind="site"
            secondary={`${sitePlaces(site.id).length} ${t("places").toLowerCase()}`}
            confirmMessage={t("confirmDeleteSite", {
              name: site.name,
              places: sitePlaces(site.id).length,
              items: siteItemCount(site.id),
            })}
            editing={editing?.kind === "site" && editing.location.id === site.id}
            token={token}
            onEdit={() => setEditing({ kind: "site", location: site })}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              onSaved();
              onNotice(t("locationUpdated"));
            }}
            onDeleted={() => {
              setEditing(null);
              onSaved();
              onNotice(t("locationDeleted"));
            }}
            onError={onNotice}
          />
          {sitePlaces(site.id).map((place) => (
            <LocationRow
              icon={<MapPin size={17} />}
              location={place}
              kind="place"
              secondary={place.type || t("places")}
              confirmMessage={t("confirmDeletePlace", {
                name: place.name,
                items: placeItemCount(place.id),
              })}
              editing={editing?.kind === "place" && editing.location.id === place.id}
              token={token}
              onEdit={() => setEditing({ kind: "place", location: place })}
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                onSaved();
                onNotice(t("locationUpdated"));
              }}
              onDeleted={() => {
                setEditing(null);
                onSaved();
                onNotice(t("locationDeleted"));
              }}
              onError={onNotice}
              key={place.id}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

type LocationRowProps = {
  icon: ReactNode;
  location: Site | Place;
  kind: "site" | "place";
  secondary: string;
  confirmMessage: string;
  editing: boolean;
  token: string;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onError: (message: string) => void;
};

function LocationRow({
  icon,
  location,
  kind,
  secondary,
  confirmMessage,
  editing,
  token,
  onEdit,
  onCancel,
  onSaved,
  onDeleted,
  onError,
}: LocationRowProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(location.name);
  const [type, setType] = useState(location.type ?? "");

  useEffect(() => {
    setName(location.name);
    setType(location.type ?? "");
  }, [location]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await api(`/${kind}s/${location.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ name, type: type || null }),
      });
      onSaved();
    } catch (error) {
      onError(error instanceof Error ? error.message : t("unableToUpdateLocation"));
    }
  }

  async function remove() {
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      await api(`/${kind}s/${location.id}`, token, { method: "DELETE" });
      onDeleted();
    } catch (error) {
      onError(error instanceof Error ? error.message : t("unableToDeleteLocation"));
    }
  }

  if (editing) {
    return (
      <form className="location-row location-edit" onSubmit={save}>
        <span className="location-icon">{icon}</span>
        <div className="location-fields">
          <input value={name} onChange={(event) => setName(event.target.value)} required />
          <input
            value={type}
            onChange={(event) => setType(event.target.value)}
            placeholder={t("type")}
          />
        </div>
        <div className="location-actions">
          <button type="submit" aria-label={t("saveChanges")} title={t("saveChanges")}>
            <Check size={17} />
          </button>
          <button type="button" aria-label={t("cancel")} title={t("cancel")} onClick={onCancel}>
            <X size={17} />
          </button>
        </div>
      </form>
    );
  }

  return (
    <article className={`location-row ${kind === "place" ? "place-row" : ""}`}>
      <span className="location-icon">{icon}</span>
      <div className="location-copy">
        <h3>{location.name}</h3>
        <p>{secondary}</p>
      </div>
      <div className="location-actions">
        <button
          type="button"
          aria-label={t("editLocation")}
          title={t("editLocation")}
          onClick={onEdit}
        >
          <Pencil size={16} />
        </button>
        <button
          type="button"
          className="danger"
          aria-label={t("deleteLocation")}
          title={t("deleteLocation")}
          onClick={remove}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
}

type LocationFormProps = {
  token: string;
  sites: Site[];
  onSaved: () => void;
  onNotice: (message: string) => void;
};

function LocationForm({ token, sites, onSaved, onNotice }: LocationFormProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"site" | "place">("site");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload =
      mode === "site"
        ? { name: form.get("name"), type: form.get("type") }
        : {
            name: form.get("name"),
            type: form.get("type"),
            site_id: Number(form.get("site")),
          };

    try {
      await api(mode === "site" ? "/sites" : "/places", token, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      formElement.reset();
      onSaved();
      onNotice(mode === "site" ? t("siteAdded") : t("placeAdded"));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : t("unableToAddLocation"));
    }
  }

  return (
    <form className="panel quick-add" id="location-form" onSubmit={submit}>
      <div className="panel-heading">
        <div>
          <h2>{t("addLocationTitle")}</h2>
          <p>{t("dependableHome")}</p>
        </div>
        <MapPin size={20} />
      </div>
      <div className="kind-selector">
        <button
          type="button"
          className={mode === "site" ? "active" : ""}
          onClick={() => setMode("site")}
        >
          {t("site")}
        </button>
        <button
          type="button"
          className={mode === "place" ? "active" : ""}
          onClick={() => setMode("place")}
        >
          {t("places")}
        </button>
      </div>
      <label>
        {t("name")}
        <input
          name="name"
          placeholder={mode === "site" ? t("siteNamePlaceholder") : t("placeNamePlaceholder")}
          required
        />
      </label>
      <label>
        {t("type")}
        <input
          name="type"
          placeholder={mode === "site" ? t("siteTypePlaceholder") : t("placeTypePlaceholder")}
        />
      </label>
      {mode === "place" && (
        <label>
          {t("site")}
          <select name="site" defaultValue="" required>
            <option value="" disabled>
              {t("selectSite")}
            </option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button className="primary-action">
        <CirclePlus size={17} />
        {mode === "site" ? t("addSite") : t("addPlace")}
      </button>
    </form>
  );
}

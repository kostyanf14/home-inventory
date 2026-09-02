import type { Item, Place, Site } from "./types";

export function locationPath(item: Item, places: Place[], sites: Site[]): string {
  const place = places.find((entry) => entry.id === item.place_id);
  const site = sites.find((entry) => entry.id === (item.site_id ?? place?.site_id));
  if (site && place) {
    return `${site.name}/${place.name}`;
  }
  return site?.name ?? place?.name ?? "";
}

export function locationKey(item: Item, places: Place[]): string {
  const place = places.find((entry) => entry.id === item.place_id);
  const siteId = item.site_id ?? place?.site_id;
  if (siteId == null) {
    return "";
  }
  return `${siteId}:${item.place_id}`;
}

export function todayIsoDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isExpiredMedicine(item: Item, today = todayIsoDate()): boolean {
  const expiration = item.medicine_details?.expiration_date;
  return Boolean(expiration && expiration < today);
}

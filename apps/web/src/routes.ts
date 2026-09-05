import type { ActiveView } from "./types";

export type ItemEditorId = number | "new";

export type AppRoute = {
  view: ActiveView;
  itemId?: ItemEditorId;
};

const VIEW_PATHS: Record<ActiveView, string> = {
  inventory: "/",
  medicines: "/medicines",
  foods: "/foods",
  locations: "/locations",
  items: "/items",
};

export function pathFromView(view: ActiveView): string {
  return VIEW_PATHS[view];
}

export function pathFromRoute(route: AppRoute): string {
  if (route.view === "items") {
    if (route.itemId === "new") {
      return "/items/new";
    }
    if (typeof route.itemId === "number") {
      return `/items/${route.itemId}`;
    }
    return "/items";
  }
  return pathFromView(route.view);
}

export function routeFromPath(pathname: string): AppRoute {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/medicines") {
    return { view: "medicines" };
  }
  if (path === "/foods") {
    return { view: "foods" };
  }
  if (path === "/locations") {
    return { view: "locations" };
  }
  if (path === "/items") {
    return { view: "items" };
  }
  if (path === "/items/new") {
    return { view: "items", itemId: "new" };
  }
  const itemMatch = /^\/items\/(\d+)$/.exec(path);
  if (itemMatch) {
    return { view: "items", itemId: Number(itemMatch[1]) };
  }
  if (path.startsWith("/items/")) {
    return { view: "items" };
  }
  return { view: "inventory" };
}

export function viewFromPath(pathname: string): ActiveView {
  return routeFromPath(pathname).view;
}

export function canonicalPath(pathname: string): string {
  return pathFromRoute(routeFromPath(pathname));
}

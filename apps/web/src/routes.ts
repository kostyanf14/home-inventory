import type { ActiveView } from "./types";

const VIEW_PATHS: Record<ActiveView, string> = {
  inventory: "/",
  medicines: "/medicines",
  locations: "/locations",
};

export function pathFromView(view: ActiveView): string {
  return VIEW_PATHS[view];
}

export function viewFromPath(pathname: string): ActiveView {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/medicines") {
    return "medicines";
  }
  if (path === "/locations") {
    return "locations";
  }
  return "inventory";
}

export function canonicalPath(pathname: string): string {
  return pathFromView(viewFromPath(pathname));
}

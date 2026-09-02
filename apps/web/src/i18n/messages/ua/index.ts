import type { MessageCatalog } from "../en";

import { inventory } from "./inventory";
import { items } from "./items";
import { locations } from "./locations";
import { medicines } from "./medicines";
import { shared } from "./shared";
import { welcome } from "./welcome";

export const uaMessages = {
  ...shared,
  ...inventory,
  ...items,
  ...locations,
  ...medicines,
  ...welcome,
} satisfies MessageCatalog;
